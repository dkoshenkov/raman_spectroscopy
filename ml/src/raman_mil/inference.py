from __future__ import annotations

from pathlib import Path
from typing import Any

import torch
import numpy as np
from scipy.signal import find_peaks

from src.utils import load_spectrum
from .data import id2target, preprocess_spectrum
from .explain import integrated_gradients, summarize_top_intervals
from .model import RamanMILConfig, RamanMILModel

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_checkpoint(path: str | Path, map_location: str | torch.device = "cpu") -> tuple[RamanMILModel, dict[str, Any]]:
    checkpoint = torch.load(path, map_location=map_location, weights_only=False)
    config = RamanMILConfig(**checkpoint["model_config"])
    model = RamanMILModel(config)
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    return model, checkpoint


def load_fold_checkpoints(
    model_dir: str | Path,
    map_location: str | torch.device = "cpu",
) -> list[tuple[Path, RamanMILModel, dict[str, Any]]]:
    root = Path(model_dir)
    checkpoint_paths = sorted(root.glob("fold_*/best_model.pt"))
    if not checkpoint_paths:
        raise FileNotFoundError(f"No fold checkpoints found in {root}")

    loaded: list[tuple[Path, RamanMILModel, dict[str, Any]]] = []
    for path in checkpoint_paths:
        model, checkpoint = load_checkpoint(path, map_location=map_location)
        loaded.append((path, model, checkpoint))
    return loaded


def preprocess_single_spectrum_file(
    spectrum_path: str | Path,
    common_nu: np.ndarray,
    preprocess_mode: str,
    preprocess_kwargs: dict[str, Any] | None = None,
) -> dict[str, np.ndarray]:
    raw = load_spectrum(spectrum_path)
    if raw.ndim != 2 or raw.shape[1] < 2:
        raise ValueError("Spectrum txt must contain at least 2 columns: wavelength and intensity")
    raw_nu = raw[:, 0].astype(np.float32)
    raw_intensity = raw[:, 1].astype(np.float32)
    overlap_left = max(float(raw_nu.min()), float(common_nu.min()))
    overlap_right = min(float(raw_nu.max()), float(common_nu.max()))
    if overlap_right <= overlap_left:
        raise ValueError(
            "Input spectrum range does not overlap model common_nu range. "
            f"input=[{float(raw_nu.min()):.3f}, {float(raw_nu.max()):.3f}], "
            f"model=[{float(common_nu.min()):.3f}, {float(common_nu.max()):.3f}]"
        )
    resampled = np.interp(common_nu, raw_nu, raw_intensity).astype(np.float32)
    processed = preprocess_spectrum(resampled, **(preprocess_kwargs or {}))
    if preprocess_mode not in processed:
        raise ValueError(f"Unknown preprocess_mode={preprocess_mode!r}")
    return {
        "raw_nu": raw_nu,
        "raw_intensity": raw_intensity,
        "resampled_intensity": resampled,
        "processed_spectrum": processed[preprocess_mode].astype(np.float32),
    }


def ensemble_predict_spectrum(
    loaded_models: list[tuple[Path, RamanMILModel, dict[str, Any]]],
    spectrum: np.ndarray,
    device: str | torch.device | None = None,
) -> dict[str, Any]:
    if not loaded_models:
        raise ValueError("loaded_models must not be empty")

    per_fold = []
    for checkpoint_path, model, checkpoint in loaded_models:
        if device is not None:
            model = model.to(device)
        pred = predict_spectrum(model, spectrum, device=device)
        per_fold.append(
            {
                "checkpoint_path": str(checkpoint_path),
                "fold": int(checkpoint.get("fold", len(per_fold))),
                "probs": pred["probs"],
                "pred_class": int(pred["pred_class"]),
                "pred_label": id2target[int(pred["pred_class"])],
                "logits": pred["logits"],
            }
        )

    probs = np.stack([item["probs"] for item in per_fold], axis=0)
    mean_probs = probs.mean(axis=0)
    pred_class = int(mean_probs.argmax())
    return {
        "per_fold": per_fold,
        "mean_probs": mean_probs,
        "pred_class": pred_class,
        "pred_label": id2target[pred_class],
    }


def ensemble_explain_spectrum(
    loaded_models: list[tuple[Path, RamanMILModel, dict[str, Any]]],
    spectrum: np.ndarray,
    common_nu: np.ndarray,
    target_class: int | None = None,
    steps: int = 64,
    device: str | torch.device | None = None,
) -> dict[str, Any]:
    if not loaded_models:
        raise ValueError("loaded_models must not be empty")

    if target_class is None:
        pred = ensemble_predict_spectrum(loaded_models, spectrum, device=device)
        target_class = int(pred["pred_class"])

    fold_items = []
    for checkpoint_path, model, checkpoint in loaded_models:
        if device is not None:
            model = model.to(device)
        item = explain_spectrum(
            model=model,
            spectrum=spectrum,
            common_nu=common_nu,
            target_class=target_class,
            steps=steps,
            device=device,
        )
        fold_items.append(
            {
                "checkpoint_path": str(checkpoint_path),
                "fold": int(checkpoint.get("fold", len(fold_items))),
                "attribution": item["attribution"],
            }
        )

    mean_attr = np.stack([item["attribution"] for item in fold_items], axis=0).mean(axis=0)
    return {
        "target_class": int(target_class),
        "target_name": id2target[int(target_class)],
        "attribution": mean_attr,
        "intervals": summarize_top_intervals(common_nu, mean_attr),
        "per_fold": fold_items,
    }


def extract_spectrum_peaks(
    common_nu: np.ndarray,
    spectrum: np.ndarray,
    top_n: int = 10,
    prominence_quantile: float = 0.75,
) -> list[dict[str, float]]:
    if common_nu.shape[0] != spectrum.shape[0]:
        raise ValueError("common_nu and spectrum must have the same length")

    spectrum = np.asarray(spectrum, dtype=np.float32)
    common_nu = np.asarray(common_nu, dtype=np.float32)
    if spectrum.size < 3:
        return []

    prominence = float(np.quantile(np.abs(spectrum), prominence_quantile)) * 0.1
    peak_indices, peak_props = find_peaks(spectrum, prominence=prominence)
    if peak_indices.size == 0:
        return []

    prominences = peak_props.get("prominences", np.zeros_like(peak_indices, dtype=np.float32))
    order = np.argsort(prominences)[::-1][:top_n]
    peaks: list[dict[str, float]] = []
    for idx in order:
        peak_idx = int(peak_indices[idx])
        peaks.append(
            {
                "peak_idx": peak_idx,
                "peak_nu": float(common_nu[peak_idx]),
                "intensity": float(spectrum[peak_idx]),
                "prominence": float(prominences[idx]),
            }
        )
    return peaks


DEFAULT_MODEL_DIRS = {
    1500: PROJECT_ROOT / "artifacts" / "raman_mil_train_and_results_1500",
    2900: PROJECT_ROOT / "artifacts" / "raman_mil_train_and_results_2900",
}


def infer_single_spectrum_file(
    spectrum_path: str | Path,
    center: int,
    model_dir: str | Path | None = None,
    device: str | torch.device = "cpu",
    explain: bool = True,
    ig_steps: int = 64,
    peak_top_n: int = 10,
) -> dict[str, Any]:
    if center not in DEFAULT_MODEL_DIRS and model_dir is None:
        raise ValueError(f"Unsupported center={center}. Expected one of {sorted(DEFAULT_MODEL_DIRS)}")

    resolved_model_dir = Path(model_dir) if model_dir is not None else DEFAULT_MODEL_DIRS[int(center)]
    loaded_models = load_fold_checkpoints(resolved_model_dir, map_location=device)

    first_checkpoint = loaded_models[0][2]
    common_nu = np.asarray(first_checkpoint["common_nu"], dtype=np.float32)
    preprocess_mode = str(first_checkpoint["preprocess_mode"])
    preprocess_kwargs = dict(first_checkpoint.get("preprocess_kwargs", {}))

    prepared = preprocess_single_spectrum_file(
        spectrum_path=spectrum_path,
        common_nu=common_nu,
        preprocess_mode=preprocess_mode,
        preprocess_kwargs=preprocess_kwargs,
    )
    prediction = ensemble_predict_spectrum(
        loaded_models=loaded_models,
        spectrum=prepared["processed_spectrum"],
        device=device,
    )

    class_probs = {
        id2target[idx]: float(prob)
        for idx, prob in enumerate(np.asarray(prediction["mean_probs"], dtype=np.float32))
    }
    visualization: dict[str, Any] = {
        "spectrum": {
            "x": common_nu.astype(np.float32),
            "y": prepared["processed_spectrum"].astype(np.float32),
            "label": "processed_spectrum",
        },
        "peaks": extract_spectrum_peaks(
            common_nu=common_nu,
            spectrum=prepared["processed_spectrum"],
            top_n=peak_top_n,
        ),
        "important_regions": [],
    }

    explanation = None
    if explain:
        explanation = ensemble_explain_spectrum(
            loaded_models=loaded_models,
            spectrum=prepared["processed_spectrum"],
            common_nu=common_nu,
            target_class=int(prediction["pred_class"]),
            steps=ig_steps,
            device=device,
        )
        visualization["important_regions"] = explanation["intervals"]
        visualization["attribution"] = {
            "x": common_nu.astype(np.float32),
            "y": np.asarray(explanation["attribution"], dtype=np.float32),
            "label": f"integrated_gradients_{explanation['target_name']}",
        }

    return {
        "pred_class_id": int(prediction["pred_class"]),
        "pred_class_name": prediction["pred_label"],
        "class_probs": class_probs,
        "visualization": visualization,
        "source": {
            "spectrum_path": str(Path(spectrum_path).resolve()),
            "center": int(center),
            "model_dir": str(resolved_model_dir.resolve()),
            "preprocess_mode": preprocess_mode,
            "preprocess_kwargs": preprocess_kwargs,
        },
        "debug": {
            "per_fold": prediction["per_fold"],
            "raw_spectrum": {
                "x": prepared["raw_nu"].astype(np.float32),
                "y": prepared["raw_intensity"].astype(np.float32),
                "label": "raw_spectrum",
            },
            "resampled_spectrum": {
                "x": common_nu.astype(np.float32),
                "y": prepared["resampled_intensity"].astype(np.float32),
                "label": "resampled_spectrum",
            },
            "explanation": explanation,
        },
    }


@torch.no_grad()
def predict_spectrum(
    model: RamanMILModel,
    spectrum: np.ndarray | torch.Tensor,
    tissue_id: int | None = None,
    device: str | torch.device | None = None,
) -> dict[str, Any]:
    model.eval()
    if device is None:
        device = next(model.parameters()).device
    spec_tensor = torch.as_tensor(spectrum, dtype=torch.float32, device=device)
    tissue_tensor = None
    if model.config.use_metadata:
        if tissue_id is None:
            raise ValueError("tissue_id is required for metadata-aware model")
        tissue_tensor = torch.tensor([tissue_id], dtype=torch.long, device=device)
    out = model.forward_instance(spec_tensor.unsqueeze(0) if spec_tensor.ndim == 1 else spec_tensor, tissue_tensor)
    probs = out["probs"][0].detach().cpu().numpy()
    pred_class = int(probs.argmax())
    return {
        "logits": out["logits"][0].detach().cpu().numpy(),
        "probs": probs,
        "pred_class": pred_class,
        "embedding": out["embeddings"][0].detach().cpu().numpy(),
    }


@torch.no_grad()
def predict_map(
    model: RamanMILModel,
    spectra: np.ndarray | torch.Tensor,
    tissue_id: int | None = None,
    device: str | torch.device | None = None,
    chunk_size: int | None = None,
) -> dict[str, Any]:
    model.eval()
    if device is None:
        device = next(model.parameters()).device
    spectra_np = np.asarray(spectra, dtype=np.float32)
    if spectra_np.ndim != 2:
        raise ValueError("spectra must have shape [N, L]")
    if chunk_size is None or chunk_size >= spectra_np.shape[0]:
        spectra_tensor = torch.as_tensor(spectra_np, dtype=torch.float32, device=device).unsqueeze(0)
        mask = torch.ones(1, spectra_np.shape[0], dtype=torch.bool, device=device)
        tissue_tensor = None
        if model.config.use_metadata:
            if tissue_id is None:
                raise ValueError("tissue_id is required for metadata-aware model")
            tissue_tensor = torch.tensor([tissue_id], dtype=torch.long, device=device)
        out = model.forward_bag(spectra_tensor, mask, tissue_tensor)
        bag_probs = out["bag_probs"][0].detach().cpu().numpy()
        pred_class = int(bag_probs.argmax())
        return {
            "bag_logits": out["bag_logits"][0].detach().cpu().numpy(),
            "bag_probs": bag_probs,
            "pred_class": pred_class,
            "attention": out["attention"][0].detach().cpu().numpy(),
            "instance_probs": out["instance_probs"][0].detach().cpu().numpy(),
        }

    embedding_chunks = []
    logits_chunks = []
    for start in range(0, spectra_np.shape[0], chunk_size):
        stop = min(start + chunk_size, spectra_np.shape[0])
        chunk = torch.as_tensor(spectra_np[start:stop], dtype=torch.float32, device=device)
        tissue_tensor = None
        if model.config.use_metadata:
            if tissue_id is None:
                raise ValueError("tissue_id is required for metadata-aware model")
            tissue_tensor = torch.full((chunk.shape[0],), int(tissue_id), dtype=torch.long, device=device)
        out = model.forward_instance(chunk, tissue_tensor)
        embedding_chunks.append(out["embeddings"])
        logits_chunks.append(out["logits"])

    embeddings = torch.cat(embedding_chunks, dim=0).unsqueeze(0)
    instance_logits = torch.cat(logits_chunks, dim=0).unsqueeze(0)
    mask = torch.ones(1, embeddings.shape[1], dtype=torch.bool, device=device)
    bag_logits, attention, _ = model.mil_head(embeddings, mask)
    bag_probs = torch.softmax(bag_logits, dim=-1)[0].detach().cpu().numpy()
    instance_probs = torch.softmax(instance_logits, dim=-1)[0].detach().cpu().numpy()
    pred_class = int(bag_probs.argmax())
    return {
        "bag_logits": bag_logits[0].detach().cpu().numpy(),
        "bag_probs": bag_probs,
        "pred_class": pred_class,
        "attention": attention[0].detach().cpu().numpy(),
        "instance_probs": instance_probs,
    }


def explain_spectrum(
    model: RamanMILModel,
    spectrum: np.ndarray | torch.Tensor,
    common_nu: np.ndarray,
    tissue_id: int | None = None,
    target_class: int | None = None,
    steps: int = 64,
    device: str | torch.device | None = None,
) -> dict[str, Any]:
    if device is None:
        device = next(model.parameters()).device
    spec_tensor = torch.as_tensor(spectrum, dtype=torch.float32, device=device)
    ig = integrated_gradients(
        model=model,
        spectrum=spec_tensor,
        tissue_id=tissue_id,
        target_class=target_class,
        steps=steps,
        device=torch.device(device),
    )
    ig["intervals"] = summarize_top_intervals(common_nu, ig["attribution"])
    return ig
