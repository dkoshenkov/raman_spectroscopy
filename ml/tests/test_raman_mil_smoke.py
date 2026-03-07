from pathlib import Path
import os

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("KMP_INIT_AT_FORK", "FALSE")

import torch
import numpy as np

from src.raman_mil.data import build_dataset_for_center, build_map_records, make_bag_collate
from src.raman_mil.explain import summarize_top_intervals
from src.raman_mil.inference import load_checkpoint
from src.raman_mil.model import RamanMILConfig, RamanMILModel
from src.raman_mil.training import MulticlassFocalLoss, TrainingConfig, build_model, save_checkpoint


def test_dataset_contract_center_1500():
    ds = build_dataset_for_center(Path("data"), center_value=1500, preprocess_mode="clean")
    assert ds["center"] == 1500
    assert ds["X_num"].ndim == 2
    assert ds["X_num"].shape[1] == len(ds["common_nu"])
    assert ds["meta_df"]["sample_id"].nunique() == ds["meta_df"].shape[0]
    records = build_map_records(ds)
    assert len(records) == ds["meta_df"].shape[0]
    for rec in records[:3]:
        assert rec["spectra"].shape[1] == len(ds["common_nu"])


def test_model_forward_and_explainability():
    config = RamanMILConfig(input_length=32, use_metadata=True, norm_type="group", group_norm_groups=8)
    model = RamanMILModel(config)
    spectra = torch.randn(2, 5, 32)
    mask = torch.tensor([[1, 1, 1, 0, 0], [1, 1, 1, 1, 1]], dtype=torch.bool)
    tissue_ids = torch.tensor([0, 1], dtype=torch.long)
    out = model.forward_bag(spectra, mask, tissue_ids)
    assert out["bag_logits"].shape == (2, 3)
    assert out["attention"].shape == (2, 5)
    assert torch.allclose(out["attention"][0, :3].sum(), torch.tensor(1.0), atol=1e-5)
    intervals = summarize_top_intervals(np.arange(32), np.linspace(-1.0, 1.0, 32), min_run=2, threshold_quantile=0.75)
    assert isinstance(intervals, list)


def test_focal_loss_finite_with_class_weights():
    criterion = MulticlassFocalLoss(
        gamma=2.0,
        weight=torch.tensor([1.0, 2.0, 3.0], dtype=torch.float32),
        label_smoothing=0.05,
    )
    logits = torch.tensor([[1.0, 0.1, -0.2], [0.2, 0.3, 1.4]], dtype=torch.float32)
    targets = torch.tensor([0, 2], dtype=torch.long)
    loss = criterion(logits, targets)
    assert torch.isfinite(loss)
    assert loss.item() > 0.0


def test_collate_sampling_shapes():
    item = {
        "spectra": torch.randn(10, 16),
        "label": 1,
        "group": 0,
        "sample_id": 0,
        "tissue_id": 2,
        "name": "sample",
    }
    batch = make_bag_collate(max_spectra_per_map=4, random_sample=False)([item, item])
    assert batch.spectra.shape == (2, 4, 16)
    assert batch.mask.sum().item() == 8


def test_checkpoint_roundtrip_preserves_new_config_fields(tmp_path):
    train_config = TrainingConfig(output_dir=str(tmp_path), fold_limit=1)
    model = build_model(train_config, input_length=32)
    dataset_bundle = {
        "common_nu": np.arange(32, dtype=np.float32),
        "preprocess_mode": "clean",
        "preprocess_kwargs": {"lam": 3000.0},
    }
    ckpt_path = tmp_path / "model.pt"
    save_checkpoint(ckpt_path, model, train_config, dataset_bundle, extra={"fold": 0})
    loaded_model, checkpoint = load_checkpoint(ckpt_path)
    assert checkpoint["train_config"]["bag_focal_gamma"] == train_config.bag_focal_gamma
    assert checkpoint["model_config"]["norm_type"] == train_config.norm_type
    assert checkpoint["model_config"]["group_norm_groups"] == train_config.group_norm_groups
    assert loaded_model.config.norm_type == "group"
