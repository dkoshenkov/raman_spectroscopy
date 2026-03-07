from __future__ import annotations

from dataclasses import asdict, dataclass, field
from contextlib import nullcontext
import json
from pathlib import Path
import random
from typing import Any, Literal

import torch
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import LeaveOneGroupOut
from torch import nn
import torch.nn.functional as F
from torch.optim import AdamW
from torch.utils.data import DataLoader
from tqdm import tqdm

from .data import (
    BagBatch,
    RamanMapDataset,
    build_dataset_for_center,
    build_map_records,
    compute_class_weights,
    dataframe_from_records,
    id2target,
    make_bag_collate,
)
from .inference import explain_spectrum, predict_map
from .model import RamanMILConfig, RamanMILModel
from .plotting import plot_attention_weights, plot_confusion_matrix, plot_spectrum_attribution, plot_training_history


@dataclass
class TrainingConfig:
    data_dir: str = "data"
    output_dir: str = "artifacts/raman_mil"
    center: int = 1500
    preprocess_mode: str = "clean"
    preprocess_kwargs: dict[str, Any] = field(
        default_factory=lambda: {"lam": 3e3, "p": 7e-3, "polyorder": 6, "window_length": 21}
    )
    use_metadata: bool = False
    max_spectra_per_map: int = 128
    eval_chunk_size: int = 128
    batch_size: int = 2
    num_workers: int = 0
    encoder_dim: int = 128
    stem_channels: int = 32
    branch_channels: int = 32
    metadata_dim: int = 8
    attention_dim: int = 128
    dropout: float = 0.15
    encoder_chunk_size: int | None = 32
    norm_type: str = "group"
    group_norm_groups: int = 8
    warmup_epochs: int = 12
    joint_epochs: int = 24
    learning_rate: float = 5e-4
    weight_decay: float = 3e-4
    top_k_ratio: float = 0.03
    bag_loss_weight: float = 1.0
    instance_loss_weight: float = 0.75
    consistency_loss_weight: float = 0.0
    gradient_clip_norm: float = 5.0
    bag_loss_name: Literal["focal"] = "focal"
    bag_focal_gamma: float = 1.0
    bag_label_smoothing: float = 0.05
    instance_label_smoothing: float = 0.05
    scheduler_patience: int = 4
    scheduler_factor: float = 0.5
    scheduler_min_lr: float = 1e-6
    use_amp: bool = True
    seed: int = 42
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    fold_limit: int | None = None
    save_attention_plots: bool = True
    save_attribution_plots: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def bag_batch_to_device(batch: BagBatch, device: torch.device) -> BagBatch:
    return BagBatch(
        spectra=batch.spectra.to(device),
        mask=batch.mask.to(device),
        labels=batch.labels.to(device),
        groups=batch.groups.to(device),
        sample_ids=batch.sample_ids.to(device),
        tissue_ids=batch.tissue_ids.to(device),
        names=batch.names,
        lengths=batch.lengths.to(device),
    )


def build_model(config: TrainingConfig, input_length: int) -> RamanMILModel:
    model_config = RamanMILConfig(
        input_length=input_length,
        encoder_dim=config.encoder_dim,
        stem_channels=config.stem_channels,
        branch_channels=config.branch_channels,
        metadata_dim=config.metadata_dim,
        use_metadata=config.use_metadata,
        attention_dim=config.attention_dim,
        dropout=config.dropout,
        encoder_chunk_size=config.encoder_chunk_size,
        norm_type=config.norm_type,
        group_norm_groups=config.group_norm_groups,
    )
    return RamanMILModel(model_config)


class MulticlassFocalLoss(nn.Module):
    def __init__(
        self,
        gamma: float = 2.0,
        weight: torch.Tensor | None = None,
        label_smoothing: float = 0.0,
    ) -> None:
        super().__init__()
        self.gamma = gamma
        self.label_smoothing = label_smoothing
        if weight is not None:
            self.register_buffer("weight", weight.clone().detach())
        else:
            self.weight = None

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce = F.cross_entropy(
            logits,
            targets,
            weight=self.weight,
            reduction="none",
            label_smoothing=self.label_smoothing,
        )
        pt = torch.exp(-ce)
        return (((1.0 - pt) ** self.gamma) * ce).mean()


def _build_weighted_cross_entropy(weight: torch.Tensor, label_smoothing: float) -> nn.Module:
    return nn.CrossEntropyLoss(weight=weight, label_smoothing=label_smoothing)


def _class_count_dict(values: np.ndarray) -> dict[str, int]:
    counts = pd.Series(values).value_counts().to_dict()
    return {id2target[idx]: int(counts.get(idx, 0)) for idx in sorted(id2target)}


def _tissue_count_dict(records: list[dict[str, Any]]) -> dict[str, int]:
    counts = pd.Series([int(rec["tissue_id"]) for rec in records]).value_counts().to_dict()
    tissue_names = {0: "cortex", 1: "striatum", 2: "cerebellum"}
    return {tissue_names[idx]: int(counts.get(idx, 0)) for idx in sorted(tissue_names)}


def _flatten_valid_instances(instance_logits: torch.Tensor, batch: BagBatch) -> tuple[torch.Tensor, torch.Tensor]:
    valid_logits = instance_logits[batch.mask]
    labels = torch.repeat_interleave(batch.labels, batch.lengths)
    return valid_logits, labels


def _autocast_context(device: torch.device, enabled: bool) -> Any:
    if enabled and device.type == "cuda":
        return torch.amp.autocast(device_type="cuda", dtype=torch.float16)
    return nullcontext()


def _make_grad_scaler(enabled: bool) -> Any:
    if hasattr(torch.amp, "GradScaler"):
        return torch.amp.GradScaler("cuda", enabled=enabled)
    return torch.cuda.amp.GradScaler(enabled=enabled)


def stage1_train_epoch(
    model: RamanMILModel,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: torch.device,
    grad_clip_norm: float,
    scaler: torch.amp.GradScaler,
    use_amp: bool,
) -> dict[str, float]:
    model.train()
    total_loss = 0.0
    total_instances = 0
    total_correct = 0
    for batch in loader:
        batch = bag_batch_to_device(batch, device)
        optimizer.zero_grad(set_to_none=True)
        tissue_ids = batch.tissue_ids if model.config.use_metadata else None
        with _autocast_context(device, use_amp):
            out = model.forward_bag(batch.spectra, batch.mask, tissue_ids)
            valid_logits, labels = _flatten_valid_instances(out["instance_logits"], batch)
            loss = criterion(valid_logits, labels)
        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip_norm)
        scaler.step(optimizer)
        scaler.update()

        total_loss += float(loss.detach().item()) * labels.shape[0]
        preds = valid_logits.argmax(dim=-1)
        total_correct += int((preds == labels).sum().item())
        total_instances += labels.shape[0]
    return {
        "loss": total_loss / max(total_instances, 1),
        "accuracy": total_correct / max(total_instances, 1),
    }


def _topk_instance_loss(
    instance_logits: torch.Tensor,
    attention: torch.Tensor,
    batch: BagBatch,
    criterion: nn.Module,
    top_k_ratio: float,
) -> torch.Tensor:
    losses = []
    for bag_idx in range(instance_logits.shape[0]):
        valid_n = int(batch.lengths[bag_idx].item())
        k = max(1, int(np.ceil(valid_n * top_k_ratio)))
        scores = attention[bag_idx, :valid_n]
        top_idx = torch.topk(scores, k=min(k, valid_n), dim=0).indices
        bag_logits = instance_logits[bag_idx, top_idx]
        labels = torch.full((bag_logits.shape[0],), int(batch.labels[bag_idx].item()), device=bag_logits.device, dtype=torch.long)
        losses.append(criterion(bag_logits, labels))
    return torch.stack(losses).mean() if losses else instance_logits.sum() * 0.0


def stage2_train_epoch(
    model: RamanMILModel,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    bag_criterion: nn.Module,
    instance_criterion: nn.Module,
    device: torch.device,
    config: TrainingConfig,
    scaler: torch.amp.GradScaler,
) -> dict[str, float]:
    model.train()
    totals = {"loss": 0.0, "bag_loss": 0.0, "instance_loss": 0.0, "consistency_loss": 0.0, "n_bags": 0}
    for batch in loader:
        batch = bag_batch_to_device(batch, device)
        optimizer.zero_grad(set_to_none=True)
        tissue_ids = batch.tissue_ids if model.config.use_metadata else None
        with _autocast_context(device, config.use_amp):
            out = model.forward_bag(batch.spectra, batch.mask, tissue_ids)

            bag_loss = bag_criterion(out["bag_logits"], batch.labels)
            instance_loss = _topk_instance_loss(out["instance_logits"], out["attention"], batch, instance_criterion, config.top_k_ratio)
            consistency_loss = F.mse_loss(out["bag_probs"], out["attention_weighted_instance_probs"])
            loss = (
                config.bag_loss_weight * bag_loss
                + config.instance_loss_weight * instance_loss
                + config.consistency_loss_weight * consistency_loss
            )
        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), config.gradient_clip_norm)
        scaler.step(optimizer)
        scaler.update()

        bag_count = batch.labels.shape[0]
        totals["loss"] += float(loss.detach().item()) * bag_count
        totals["bag_loss"] += float(bag_loss.detach().item()) * bag_count
        totals["instance_loss"] += float(instance_loss.detach().item()) * bag_count
        totals["consistency_loss"] += float(consistency_loss.detach().item()) * bag_count
        totals["n_bags"] += bag_count
    denom = max(totals["n_bags"], 1)
    return {key: value / denom for key, value in totals.items() if key != "n_bags"}


def evaluate_model(
    model: RamanMILModel,
    records: list[dict[str, Any]],
    device: torch.device,
    chunk_size: int,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    rows = []
    spectrum_true = []
    spectrum_pred = []
    for rec in records:
        pred = predict_map(
            model=model,
            spectra=rec["spectra"],
            tissue_id=rec["tissue_id"] if model.config.use_metadata else None,
            device=device,
            chunk_size=chunk_size,
        )
        row = {
            "sample_id": rec["sample_id"],
            "name": rec["name"],
            "group": rec["group"],
            "y_true": rec["label"],
            "y_pred": pred["pred_class"],
            "n_spectra": rec["n_spectra"],
        }
        for idx, prob in enumerate(pred["bag_probs"]):
            row[f"p{idx}"] = float(prob)
        rows.append(row)
        inst_pred = np.argmax(pred["instance_probs"], axis=1)
        spectrum_pred.extend(inst_pred.tolist())
        spectrum_true.extend([rec["label"]] * len(inst_pred))
    pred_df = pd.DataFrame(rows)
    y_true = pred_df["y_true"].to_numpy()
    y_pred = pred_df["y_pred"].to_numpy()
    class_report = classification_report(
        y_true,
        y_pred,
        target_names=[id2target[i] for i in sorted(id2target)],
        output_dict=True,
        zero_division=0,
    )
    metrics = {
        "macro_f1": float(f1_score(y_true, y_pred, average="macro")),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "spectrum_macro_f1": float(f1_score(spectrum_true, spectrum_pred, average="macro")),
        "spectrum_accuracy": float(accuracy_score(spectrum_true, spectrum_pred)),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "classification_report": class_report,
        "control_f1": float(class_report["control"]["f1-score"]),
        "control_recall": float(class_report["control"]["recall"]),
        "endo_f1": float(class_report["endo"]["f1-score"]),
        "endo_recall": float(class_report["endo"]["recall"]),
        "predicted_class_counts": _class_count_dict(y_pred),
    }
    return pred_df, metrics


def save_checkpoint(
    path: Path,
    model: RamanMILModel,
    train_config: TrainingConfig,
    dataset_bundle: dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> None:
    payload = {
        "state_dict": model.state_dict(),
        "model_config": model.config.to_dict(),
        "train_config": train_config.to_dict(),
        "common_nu": dataset_bundle["common_nu"],
        "preprocess_mode": dataset_bundle["preprocess_mode"],
        "preprocess_kwargs": dataset_bundle["preprocess_kwargs"],
        "label_mapping": id2target,
        "use_metadata": model.config.use_metadata,
    }
    if extra is not None:
        payload.update(extra)
    torch.save(payload, path)


def _save_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2))


def run_logo_training(config: TrainingConfig) -> dict[str, Any]:
    set_seed(config.seed)
    device = torch.device(config.device)
    output_dir = Path(config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dataset_bundle = build_dataset_for_center(
        data_dir=Path(config.data_dir),
        center_value=config.center,
        use_side=False,
        preprocess_mode=config.preprocess_mode,
        preprocess_kwargs=config.preprocess_kwargs,
    )
    records = build_map_records(dataset_bundle)
    dataframe_from_records(records).to_csv(output_dir / "map_records.csv", index=False)

    groups = np.array([rec["group"] for rec in records], dtype=np.int64)
    labels = np.array([rec["label"] for rec in records], dtype=np.int64)
    logo = LeaveOneGroupOut()

    oof_rows = []
    fold_metrics = []
    for fold_idx, (train_idx, val_idx) in enumerate(logo.split(np.zeros(len(records)), labels, groups)):
        if config.fold_limit is not None and fold_idx >= config.fold_limit:
            break
        fold_dir = output_dir / f"fold_{fold_idx}"
        fold_dir.mkdir(parents=True, exist_ok=True)
        train_records = [records[i] for i in train_idx]
        val_records = [records[i] for i in val_idx]
        train_tissue_counts = _tissue_count_dict(train_records)
        val_tissue_counts = _tissue_count_dict(val_records)
        metadata_coverage_warning = None
        if config.use_metadata:
            train_tissues = {int(rec["tissue_id"]) for rec in train_records}
            val_tissues = {int(rec["tissue_id"]) for rec in val_records}
            unseen_val_tissues = sorted(val_tissues - train_tissues)
            if unseen_val_tissues:
                tissue_names = {0: "cortex", 1: "striatum", 2: "cerebellum"}
                unseen_names = [tissue_names[idx] for idx in unseen_val_tissues]
                metadata_coverage_warning = (
                    "Validation contains tissue ids absent from training for this fold: "
                    + ", ".join(unseen_names)
                )

        train_ds = RamanMapDataset(train_records)
        val_ds = RamanMapDataset(val_records)
        train_loader = DataLoader(
            train_ds,
            batch_size=config.batch_size,
            shuffle=True,
            num_workers=config.num_workers,
            collate_fn=make_bag_collate(config.max_spectra_per_map, random_sample=True),
        )
        warmup_eval_loader = DataLoader(
            val_ds,
            batch_size=1,
            shuffle=False,
            num_workers=config.num_workers,
            collate_fn=make_bag_collate(None, random_sample=False),
        )

        model = build_model(config, input_length=len(dataset_bundle["common_nu"])).to(device)
        class_weights = compute_class_weights(train_records).to(device)
        if config.bag_loss_name != "focal":
            raise ValueError(f"Unsupported bag_loss_name={config.bag_loss_name}")
        bag_criterion = MulticlassFocalLoss(
            gamma=config.bag_focal_gamma,
            weight=class_weights,
            label_smoothing=config.bag_label_smoothing,
        )
        warmup_instance_criterion = _build_weighted_cross_entropy(
            class_weights,
            label_smoothing=config.instance_label_smoothing,
        )
        pseudo_instance_criterion = _build_weighted_cross_entropy(class_weights, label_smoothing=0.0)
        optimizer = AdamW(model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)
        scaler = _make_grad_scaler(config.use_amp and device.type == "cuda")
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer,
            mode="max",
            factor=config.scheduler_factor,
            patience=config.scheduler_patience,
            min_lr=config.scheduler_min_lr,
        )

        history: dict[str, list[float]] = {
            "stage1_loss": [],
            "stage1_accuracy": [],
            "stage2_loss": [],
            "stage2_bag_loss": [],
            "stage2_instance_loss": [],
            "stage2_consistency_loss": [],
            "val_macro_f1": [],
            "val_accuracy": [],
        }

        for _ in tqdm(range(config.warmup_epochs), desc=f"fold {fold_idx} warmup"):
            train_stats = stage1_train_epoch(
                model=model,
                loader=train_loader,
                optimizer=optimizer,
                criterion=warmup_instance_criterion,
                device=device,
                grad_clip_norm=config.gradient_clip_norm,
                scaler=scaler,
                use_amp=config.use_amp,
            )
            history["stage1_loss"].append(train_stats["loss"])
            history["stage1_accuracy"].append(train_stats["accuracy"])

        best_state = None
        best_metric = -np.inf
        for _ in tqdm(range(config.joint_epochs), desc=f"fold {fold_idx} joint"):
            joint_stats = stage2_train_epoch(
                model=model,
                loader=train_loader,
                optimizer=optimizer,
                bag_criterion=bag_criterion,
                instance_criterion=pseudo_instance_criterion,
                device=device,
                config=config,
                scaler=scaler,
            )
            val_df, val_metrics = evaluate_model(model, val_records, device=device, chunk_size=config.eval_chunk_size)
            scheduler.step(val_metrics["macro_f1"])
            history["stage2_loss"].append(joint_stats["loss"])
            history["stage2_bag_loss"].append(joint_stats["bag_loss"])
            history["stage2_instance_loss"].append(joint_stats["instance_loss"])
            history["stage2_consistency_loss"].append(joint_stats["consistency_loss"])
            history["val_macro_f1"].append(val_metrics["macro_f1"])
            history["val_accuracy"].append(val_metrics["accuracy"])
            history.setdefault("learning_rate", []).append(float(optimizer.param_groups[0]["lr"]))

            if val_metrics["macro_f1"] > best_metric:
                best_metric = val_metrics["macro_f1"]
                best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

        if best_state is not None:
            model.load_state_dict(best_state)

        val_df, val_metrics = evaluate_model(model, val_records, device=device, chunk_size=config.eval_chunk_size)
        val_df["fold"] = fold_idx
        oof_rows.append(val_df)
        fold_metrics.append(
            {
                "fold": fold_idx,
                "train_tissue_counts": train_tissue_counts,
                "val_tissue_counts": val_tissue_counts,
                "metadata_coverage_warning": metadata_coverage_warning,
                **val_metrics,
            }
        )

        save_checkpoint(
            fold_dir / "best_model.pt",
            model=model,
            train_config=config,
            dataset_bundle=dataset_bundle,
            extra={
                "fold": fold_idx,
                "val_metrics": val_metrics,
                "train_tissue_counts": train_tissue_counts,
                "val_tissue_counts": val_tissue_counts,
                "metadata_coverage_warning": metadata_coverage_warning,
            },
        )
        _save_json(
            fold_dir / "val_metrics.json",
            {
                **val_metrics,
                "train_tissue_counts": train_tissue_counts,
                "val_tissue_counts": val_tissue_counts,
                "metadata_coverage_warning": metadata_coverage_warning,
            },
        )
        val_df.to_csv(fold_dir / "val_predictions.csv", index=False)
        plot_confusion_matrix(
            val_df["y_true"].to_numpy(),
            val_df["y_pred"].to_numpy(),
            fold_dir / "confusion_matrix.png",
            title=f"Fold {fold_idx} confusion matrix",
        )
        plot_training_history(history, fold_dir / "training_history.png", title=f"Fold {fold_idx} training history")

        if config.save_attention_plots and len(val_records) > 0:
            attn_pred = predict_map(
                model,
                val_records[0]["spectra"],
                tissue_id=val_records[0]["tissue_id"] if model.config.use_metadata else None,
                device=device,
                chunk_size=config.eval_chunk_size,
            )
            plot_attention_weights(attn_pred["attention"], fold_dir / "attention_weights.png", f"Fold {fold_idx} attention")

        if config.save_attribution_plots and len(val_records) > 0:
            exemplar = val_records[0]
            attn_pred = predict_map(
                model,
                exemplar["spectra"],
                tissue_id=exemplar["tissue_id"] if model.config.use_metadata else None,
                device=device,
                chunk_size=config.eval_chunk_size,
            )
            top_spec_idx = int(np.argmax(attn_pred["attention"]))
            explanation = explain_spectrum(
                model=model,
                spectrum=exemplar["spectra"][top_spec_idx],
                common_nu=dataset_bundle["common_nu"],
                tissue_id=exemplar["tissue_id"] if model.config.use_metadata else None,
                target_class=exemplar["label"],
                device=device,
            )
            plot_spectrum_attribution(
                dataset_bundle["common_nu"],
                explanation["spectrum"],
                explanation["attribution"],
                explanation["intervals"],
                fold_dir / "spectrum_attribution.png",
                title=f"Fold {fold_idx} top-attended spectrum attribution",
            )
            _save_json(
                fold_dir / "spectrum_attribution.json",
                {
                    "target_class": explanation["target_class"],
                    "target_name": explanation["target_name"],
                    "intervals": explanation["intervals"],
                },
            )

    oof_df = pd.concat(oof_rows, ignore_index=True)
    oof_df.to_csv(output_dir / "oof_predictions.csv", index=False)
    y_true = oof_df["y_true"].to_numpy()
    y_pred = oof_df["y_pred"].to_numpy()
    oof_report = classification_report(
        y_true,
        y_pred,
        target_names=[id2target[i] for i in sorted(id2target)],
        output_dict=True,
        zero_division=0,
    )
    summary = {
        "macro_f1": float(f1_score(y_true, y_pred, average="macro")),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "control_f1": float(oof_report["control"]["f1-score"]),
        "control_recall": float(oof_report["control"]["recall"]),
        "endo_f1": float(oof_report["endo"]["f1-score"]),
        "endo_recall": float(oof_report["endo"]["recall"]),
        "predicted_class_counts": _class_count_dict(oof_df["y_pred"].to_numpy()),
        "fold_metrics": fold_metrics,
        "train_config": config.to_dict(),
        "dataset": {
            "center": dataset_bundle["center"],
            "common_nu_len": int(len(dataset_bundle["common_nu"])),
            "n_maps": int(len(records)),
            "n_spectra_total": int(dataset_bundle["X_num"].shape[0]),
        },
    }
    _save_json(output_dir / "summary.json", summary)
    plot_confusion_matrix(y_true, y_pred, output_dir / "oof_confusion_matrix.png", title="OOF confusion matrix")
    return summary
