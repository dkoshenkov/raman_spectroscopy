from __future__ import annotations

import torch
from dataclasses import dataclass
import hashlib
import io
import json
from pathlib import Path
import re
from typing import Any

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.signal import savgol_filter
from scipy.sparse.linalg import spsolve
from torch.utils.data import Dataset
from tqdm import tqdm

from src.utils import load_image

target2id = {"control": 0, "exo": 1, "endo": 2}
id2target = {v: k for k, v in target2id.items()}
tissue2id = {"cortex": 0, "striatum": 1, "cerebellum": 2}
id2tissue = {v: k for k, v in tissue2id.items()}
group2id = {"1": 0, "2a": 1, "2b": 2, "3": 3}
id2group = {v: k for k, v in group2id.items()}
side2id = {"none": 0, "left": 1, "right": 2}
id2side = {v: k for k, v in side2id.items()}

BAD_FILES = {
    "cortex_endo_1group_633nm_center2900_obj100_power100_1s_5acc_map35x15_step2_place2.txt",
}

CACHE_VERSION = "v1"


def parse_meta_from_name(name: str) -> dict[str, Any]:
    stem = Path(name).stem
    parts = stem.split("_")

    tissue = next((t for t in ["cortex", "striatum", "cerebellum"] if t in parts), None)
    target = next((t for t in ["control", "exo", "endo"] if t in parts), None)

    if "left" in parts:
        side = "left"
    elif "right" in parts:
        side = "right"
    else:
        side = "none"

    m_group = re.search(r"_(\d[ABab]?)[Gg]roup", stem)
    if m_group is None:
        raise ValueError(f"Cannot parse group from {name}")
    group = m_group.group(1).lower()

    m_center = re.search(r"center(\d+)", stem)
    if m_center is None:
        raise ValueError(f"Cannot parse center from {name}")
    center = int(m_center.group(1))

    if tissue is None or target is None:
        raise ValueError(f"Cannot parse tissue/target from {name}")

    return {
        "tissue": tissue,
        "target": target,
        "side": side,
        "group": group,
        "center": center,
    }


def fix_orientation(out: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    if out.shape[:2] == (len(y), len(x)):
        return out
    if out.shape[:2] == (len(x), len(y)):
        return out.transpose(1, 0, 2)
    raise ValueError(f"Unexpected shape {out.shape}, len(x)={len(x)}, len(y)={len(y)}")


def baseline_als(y: np.ndarray, lam: float = 1e5, p: float = 0.01, niter: int = 10) -> np.ndarray:
    y = np.asarray(y).flatten()
    length = len(y)
    diff = sparse.diags([1.0, -2.0, 1.0], [0, 1, 2], shape=(length - 2, length), format="csc")
    penalty = (lam * diff.transpose().dot(diff)).tocsc()

    weights = np.ones(length)
    baseline = np.zeros(length)

    for _ in range(niter):
        w_diag = sparse.spdiags(weights, 0, length, length).tocsc()
        system = (w_diag + penalty).tocsc()
        baseline = spsolve(system, weights * y)
        weights = p * (y > baseline) + (1 - p) * (y < baseline)
    return baseline


def _safe_savgol(y: np.ndarray, window_length: int, polyorder: int, deriv: int = 0) -> np.ndarray:
    n = len(y)
    if n <= polyorder + 2:
        return y.astype(np.float32, copy=True)
    wl = min(window_length, n if n % 2 == 1 else n - 1)
    wl = max(wl, polyorder + 3)
    if wl % 2 == 0:
        wl -= 1
    wl = min(wl, n if n % 2 == 1 else n - 1)
    if wl <= polyorder:
        wl = polyorder + 1 if (polyorder + 1) % 2 == 1 else polyorder + 2
    wl = min(wl, n if n % 2 == 1 else n - 1)
    if wl < 3:
        return y.astype(np.float32, copy=True)
    return savgol_filter(y, window_length=wl, polyorder=polyorder, deriv=deriv, mode="interp").astype(np.float32)


def preprocess_spectrum(
    intensity: np.ndarray,
    lam: float = 3e3,
    p: float = 7e-3,
    polyorder: int = 6,
    window_length: int = 21,
) -> dict[str, np.ndarray]:
    baseline = baseline_als(intensity, lam=lam, p=p)
    y_no_bg = np.asarray(intensity, dtype=np.float32) - baseline.astype(np.float32)
    smooth = _safe_savgol(y_no_bg, window_length=window_length, polyorder=polyorder, deriv=0)

    scale = np.max(np.abs(smooth))
    if scale < 1e-8:
        clean = smooth
    else:
        clean = smooth / scale

    d1 = _safe_savgol(clean, window_length=window_length, polyorder=polyorder, deriv=1)
    d2 = _safe_savgol(clean, window_length=window_length, polyorder=polyorder, deriv=2)

    return {
        "baseline": baseline.astype(np.float32),
        "no_bg": y_no_bg.astype(np.float32),
        "clean": clean.astype(np.float32),
        "d1": d1.astype(np.float32),
        "d2": d2.astype(np.float32),
    }


def resample_cube_to_common_nu(out: np.ndarray, nu: np.ndarray, common_nu: np.ndarray) -> np.ndarray:
    h, w, _ = out.shape
    out_rs = np.empty((h, w, len(common_nu)), dtype=np.float32)
    for i in range(h):
        for j in range(w):
            out_rs[i, j] = np.interp(common_nu, nu, out[i, j]).astype(np.float32)
    return out_rs


def _normalize_preprocess_kwargs(preprocess_kwargs: dict[str, Any] | None) -> dict[str, Any]:
    return {} if preprocess_kwargs is None else dict(sorted(preprocess_kwargs.items()))


def _dataset_cache_dir(data_dir: Path) -> Path:
    cache_dir = data_dir.parent / "artifacts" / "dataset_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _dataset_cache_key(
    data_dir: Path,
    img_paths: list[Path],
    center_value: int,
    use_side: bool,
    preprocess_mode: str,
    preprocess_kwargs: dict[str, Any],
) -> str:
    payload = {
        "cache_version": CACHE_VERSION,
        "center_value": center_value,
        "use_side": use_side,
        "preprocess_mode": preprocess_mode,
        "preprocess_kwargs": preprocess_kwargs,
        "bad_files": sorted(BAD_FILES),
        "files": [
            {
                "path": str(path.relative_to(data_dir.parent)),
                "name": path.name,
                "size": path.stat().st_size,
                "mtime_ns": path.stat().st_mtime_ns,
            }
            for path in img_paths
        ],
    }
    return hashlib.sha256(json.dumps(payload, ensure_ascii=True, sort_keys=True).encode("utf-8")).hexdigest()[:16]


def _cache_paths(
    data_dir: Path,
    img_paths: list[Path],
    center_value: int,
    use_side: bool,
    preprocess_mode: str,
    preprocess_kwargs: dict[str, Any],
) -> tuple[Path, Path]:
    cache_key = _dataset_cache_key(
        img_paths=img_paths,
        data_dir=data_dir,
        center_value=center_value,
        use_side=use_side,
        preprocess_mode=preprocess_mode,
        preprocess_kwargs=preprocess_kwargs,
    )
    cache_dir = _dataset_cache_dir(data_dir)
    base_name = f"raman_center{center_value}_{preprocess_mode}_{cache_key}"
    return cache_dir / f"{base_name}.npz", cache_dir / f"{base_name}.json"


def _save_dataset_cache(dataset: dict[str, Any], cache_npz_path: Path, cache_meta_path: Path) -> None:
    meta_payload = {
        "center": int(dataset["center"]),
        "preprocess_mode": dataset["preprocess_mode"],
        "preprocess_kwargs": dataset["preprocess_kwargs"],
        "cat_feature_names": list(dataset["cat_feature_names"]),
    }
    np.savez(
        cache_npz_path,
        common_nu=dataset["common_nu"],
        X_num=dataset["X_num"],
        X_cat=dataset["X_cat"],
        y=dataset["y"],
        groups=dataset["groups"],
        sample_ids=dataset["sample_ids"],
        meta_json=np.array(dataset["meta_df"].to_json(orient="records"), dtype=object),
        cat_feature_names=np.asarray(dataset["cat_feature_names"], dtype=object),
    )
    cache_meta_path.write_text(json.dumps(meta_payload, ensure_ascii=True, indent=2))


def _load_dataset_cache(cache_npz_path: Path, cache_meta_path: Path) -> dict[str, Any]:
    with np.load(cache_npz_path, allow_pickle=True) as data:
        meta_df = pd.read_json(io.StringIO(data["meta_json"].item()))
        cat_feature_names = data["cat_feature_names"].tolist()
        meta_payload = json.loads(cache_meta_path.read_text())
        return {
            "center": int(meta_payload["center"]),
            "common_nu": data["common_nu"].astype(np.float32, copy=False),
            "X_num": data["X_num"].astype(np.float32, copy=False),
            "X_cat": data["X_cat"].astype(np.int64, copy=False),
            "y": data["y"].astype(np.int64, copy=False),
            "groups": data["groups"].astype(np.int64, copy=False),
            "sample_ids": data["sample_ids"].astype(np.int64, copy=False),
            "meta_df": meta_df,
            "cat_feature_names": cat_feature_names,
            "preprocess_mode": meta_payload["preprocess_mode"],
            "preprocess_kwargs": meta_payload["preprocess_kwargs"],
        }


def build_dataset_for_center(
    data_dir: Path,
    center_value: int,
    use_side: bool = False,
    preprocess_mode: str = "raw",
    preprocess_kwargs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    img_paths = sorted(
        [
            p
            for p in data_dir.glob("**/*.txt")
            if "average" not in p.name.lower()
            and p.name not in BAD_FILES
            and f"center{center_value}" in p.name
        ]
    )
    if len(img_paths) == 0:
        raise ValueError(f"No files found for center={center_value}")
    preprocess_kwargs = _normalize_preprocess_kwargs(preprocess_kwargs)
    if preprocess_mode not in {"raw", "clean", "d1", "d2"}:
        raise ValueError(f"Unknown preprocess_mode={preprocess_mode}")

    cache_npz_path, cache_meta_path = _cache_paths(
        data_dir=data_dir,
        img_paths=img_paths,
        center_value=center_value,
        use_side=use_side,
        preprocess_mode=preprocess_mode,
        preprocess_kwargs=preprocess_kwargs,
    )
    if cache_npz_path.exists() and cache_meta_path.exists():
        print(f"Loading cached dataset from {cache_npz_path}")
        return _load_dataset_cache(cache_npz_path, cache_meta_path)

    mins, maxs, steps = [], [], []
    for img_path in img_paths:
        _, nu, _, _ = load_image(img_path)
        mins.append(float(nu.min()))
        maxs.append(float(nu.max()))
        steps.append(float(np.diff(nu).mean()))

    common_min = max(mins)
    common_max = min(maxs)
    common_step = float(np.median(steps))
    common_nu = np.arange(common_min, common_max + common_step / 2, common_step, dtype=np.float32)

    x_num_list = []
    x_cat_list = []
    y_list = []
    groups_list = []
    sample_ids_list = []
    meta_rows = []
    sample_id_counter = 0

    for img_path in tqdm(img_paths, desc=f"center={center_value}"):
        meta = parse_meta_from_name(img_path.name)
        out, nu, x, y = load_image(img_path)
        out = fix_orientation(out, x, y)
        out = resample_cube_to_common_nu(out, nu, common_nu)
        x_map = out.reshape(-1, out.shape[-1]).astype(np.float32)

        if preprocess_mode != "raw":
            x_proc = np.empty_like(x_map, dtype=np.float32)
            for idx in range(x_map.shape[0]):
                pp = preprocess_spectrum(x_map[idx], **preprocess_kwargs)
                x_proc[idx] = pp[preprocess_mode].astype(np.float32)
            x_map = x_proc

        n = x_map.shape[0]
        tissue_id = tissue2id[meta["tissue"]]
        side_id = side2id[meta["side"]]
        if use_side:
            x_cat_map = np.column_stack(
                [
                    np.full(n, tissue_id, dtype=np.int64),
                    np.full(n, side_id, dtype=np.int64),
                ]
            )
            cat_feature_names = ["tissue_id", "side_id"]
        else:
            x_cat_map = np.column_stack([np.full(n, tissue_id, dtype=np.int64)])
            cat_feature_names = ["tissue_id"]

        y_map = np.full(n, target2id[meta["target"]], dtype=np.int64)
        group_map = np.full(n, group2id[meta["group"]], dtype=np.int64)
        sample_ids_map = np.full(n, sample_id_counter, dtype=np.int64)

        x_num_list.append(x_map)
        x_cat_list.append(x_cat_map)
        y_list.append(y_map)
        groups_list.append(group_map)
        sample_ids_list.append(sample_ids_map)
        meta_rows.append(
            {
                "sample_id": sample_id_counter,
                "path": str(img_path),
                "name": img_path.name,
                "n_spectra": n,
                "shape_after": tuple(out.shape),
                "target": meta["target"],
                "group": meta["group"],
                "tissue": meta["tissue"],
                "side": meta["side"],
                "center": meta["center"],
                "nu_min_original": float(nu.min()),
                "nu_max_original": float(nu.max()),
            }
        )
        sample_id_counter += 1

    dataset = {
        "center": center_value,
        "common_nu": common_nu,
        "X_num": np.concatenate(x_num_list, axis=0),
        "X_cat": np.concatenate(x_cat_list, axis=0),
        "y": np.concatenate(y_list, axis=0),
        "groups": np.concatenate(groups_list, axis=0),
        "sample_ids": np.concatenate(sample_ids_list, axis=0),
        "meta_df": pd.DataFrame(meta_rows),
        "cat_feature_names": cat_feature_names,
        "preprocess_mode": preprocess_mode,
        "preprocess_kwargs": preprocess_kwargs,
    }
    _save_dataset_cache(dataset, cache_npz_path, cache_meta_path)
    print(f"Saved dataset cache to {cache_npz_path}")
    return dataset


def build_map_records(flat_ds: dict[str, Any]) -> list[dict[str, Any]]:
    x_num = flat_ds["X_num"]
    x_cat = flat_ds["X_cat"]
    y = flat_ds["y"]
    groups = flat_ds["groups"]
    sample_ids = flat_ds["sample_ids"]
    meta_df = flat_ds["meta_df"].set_index("sample_id")

    records = []
    for sample_id in np.unique(sample_ids):
        mask = sample_ids == sample_id
        sample_meta = meta_df.loc[int(sample_id)]
        records.append(
            {
                "sample_id": int(sample_id),
                "name": str(sample_meta["name"]),
                "path": str(sample_meta["path"]),
                "spectra": x_num[mask].astype(np.float32),
                "label": int(y[mask][0]),
                "group": int(groups[mask][0]),
                "tissue_id": int(x_cat[mask][0, 0]),
                "side": str(sample_meta["side"]),
                "target": str(sample_meta["target"]),
                "center": int(sample_meta["center"]),
                "n_spectra": int(mask.sum()),
            }
        )
    return records


@dataclass
class BagBatch:
    spectra: torch.Tensor
    mask: torch.Tensor
    labels: torch.Tensor
    groups: torch.Tensor
    sample_ids: torch.Tensor
    tissue_ids: torch.Tensor
    names: list[str]
    lengths: torch.Tensor


class RamanMapDataset(Dataset):
    def __init__(self, records: list[dict[str, Any]]) -> None:
        self.records = records

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        rec = self.records[idx]
        return {
            "spectra": torch.from_numpy(rec["spectra"]),
            "label": rec["label"],
            "group": rec["group"],
            "sample_id": rec["sample_id"],
            "tissue_id": rec["tissue_id"],
            "name": rec["name"],
        }


def make_bag_collate(
    max_spectra_per_map: int | None = None,
    random_sample: bool = False,
) -> Any:
    def collate(items: list[dict[str, Any]]) -> BagBatch:
        spectra_list = []
        lengths = []
        for item in items:
            spectra = item["spectra"]
            if max_spectra_per_map is not None and spectra.shape[0] > max_spectra_per_map:
                if random_sample:
                    perm = torch.randperm(spectra.shape[0])[:max_spectra_per_map]
                    spectra = spectra[perm]
                else:
                    spectra = spectra[:max_spectra_per_map]
            spectra_list.append(spectra.float())
            lengths.append(spectra.shape[0])

        max_len = max(lengths)
        batch = len(items)
        spec_dim = spectra_list[0].shape[-1]
        padded = torch.zeros(batch, max_len, spec_dim, dtype=torch.float32)
        mask = torch.zeros(batch, max_len, dtype=torch.bool)
        for idx, spectra in enumerate(spectra_list):
            n = spectra.shape[0]
            padded[idx, :n] = spectra
            mask[idx, :n] = True

        return BagBatch(
            spectra=padded,
            mask=mask,
            labels=torch.tensor([item["label"] for item in items], dtype=torch.long),
            groups=torch.tensor([item["group"] for item in items], dtype=torch.long),
            sample_ids=torch.tensor([item["sample_id"] for item in items], dtype=torch.long),
            tissue_ids=torch.tensor([item["tissue_id"] for item in items], dtype=torch.long),
            names=[str(item["name"]) for item in items],
            lengths=torch.tensor(lengths, dtype=torch.long),
        )

    return collate


def compute_class_weights(records: list[dict[str, Any]], num_classes: int = 3) -> torch.Tensor:
    counts = np.zeros(num_classes, dtype=np.float32)
    for rec in records:
        counts[rec["label"]] += 1.0
    counts = np.maximum(counts, 1.0)
    weights = counts.sum() / (num_classes * counts)
    return torch.tensor(weights, dtype=torch.float32)


def dataframe_from_records(records: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "sample_id": rec["sample_id"],
                "name": rec["name"],
                "label": rec["label"],
                "label_name": id2target[rec["label"]],
                "group": rec["group"],
                "group_name": id2group[rec["group"]],
                "tissue_id": rec["tissue_id"],
                "tissue_name": id2tissue[rec["tissue_id"]],
                "n_spectra": rec["n_spectra"],
            }
            for rec in records
        ]
    )
