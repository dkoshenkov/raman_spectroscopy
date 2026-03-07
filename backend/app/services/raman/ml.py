from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from app.core.errors import ApiError
from app.services.raman.models import ParsedUpload, RamanPoint

PROJECT_ROOT = Path(__file__).resolve().parents[4]
ML_ROOT = PROJECT_ROOT / "ml"

SUPPORTED_BANDS = {"1500", "2900"}
SUPPORTED_REGIONS = {"cortex", "striatum", "cerebellum"}


def _ensure_ml_path() -> None:
    ml_path = str(ML_ROOT)
    if ml_path not in sys.path:
        sys.path.insert(0, ml_path)


@lru_cache(maxsize=1)
def _get_infer_single_spectrum_arrays():
    _ensure_ml_path()
    try:
        from src.raman_mil.inference import infer_single_spectrum_arrays
    except Exception as exc:  # pragma: no cover - depends on local ML runtime
        raise ApiError(
            status_code=503,
            code="ML_RUNTIME_UNAVAILABLE",
            message=f"ML runtime is unavailable: {exc}",
        ) from exc
    return infer_single_spectrum_arrays


@lru_cache(maxsize=1)
def _get_tissue_mapping() -> dict[str, int]:
    _ensure_ml_path()
    try:
        from src.raman_mil.data import tissue2id
    except Exception as exc:  # pragma: no cover - depends on local ML runtime
        raise ApiError(
            status_code=503,
            code="ML_RUNTIME_UNAVAILABLE",
            message=f"ML runtime is unavailable: {exc}",
        ) from exc
    return dict(tissue2id)


def _validate_ml_metadata(upload: ParsedUpload) -> tuple[int, str]:
    band = upload.metadata.band
    if band not in SUPPORTED_BANDS:
        raise ApiError(
            status_code=409,
            code="ML_BAND_UNAVAILABLE",
            message="Для запуска модели нужно подтвердить диапазон спектра: 1500 или 2900 см^-1.",
        )

    region = upload.metadata.brain_region
    if region not in SUPPORTED_REGIONS:
        raise ApiError(
            status_code=409,
            code="ML_REGION_UNAVAILABLE",
            message="Для запуска модели нужно подтвердить область мозга: cortex, striatum или cerebellum.",
        )

    return int(band), region


def classify_raman_point(upload: ParsedUpload, point: RamanPoint) -> dict[str, Any]:
    center, region = _validate_ml_metadata(upload)
    infer_single_spectrum_arrays = _get_infer_single_spectrum_arrays()
    tissue_mapping = _get_tissue_mapping()
    try:
        return infer_single_spectrum_arrays(
            wave=np.asarray(point.spectrum.wave, dtype=np.float32),
            intensity=np.asarray(point.spectrum.intensity, dtype=np.float32),
            center=center,
            tissue_id=tissue_mapping[region],
            device="cpu",
            explain=True,
            ig_steps=32,
            peak_top_n=8,
            source_name=f"{upload.file_name}::{point.point_key}",
        )
    except ApiError:
        raise
    except Exception as exc:  # pragma: no cover - depends on local ML runtime
        raise ApiError(
            status_code=500,
            code="ML_INFERENCE_FAILED",
            message=f"Не удалось выполнить ML-инференс: {exc}",
        ) from exc
