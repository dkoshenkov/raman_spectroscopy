from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import numpy as np

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("KMP_INIT_AT_FORK", "FALSE")

from src.raman_mil.inference import (
    infer_single_spectrum_file,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Raman MIL inference for one 2-column spectrum txt.")
    parser.add_argument("spectrum_path", help="Path to txt file with 2 columns: wavelength and intensity")
    parser.add_argument("--center", type=int, required=True, choices=[1500, 2900])
    parser.add_argument("--model-dir", default=None, help="Directory with fold_*/best_model.pt checkpoints")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--explain", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--ig-steps", type=int, default=64)
    parser.add_argument("--output-json", default=None, help="Optional path to save JSON result")
    parser.add_argument(
        "--json",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Print JSON to stdout instead of short text summary",
    )
    parser.add_argument(
        "--include-arrays",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Include common_nu / processed_spectrum / attribution arrays in stdout JSON",
    )
    return parser.parse_args()


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_jsonable(v) for v in value]
    return value


def main() -> None:
    args = parse_args()
    result = infer_single_spectrum_file(
        spectrum_path=args.spectrum_path,
        center=args.center,
        model_dir=args.model_dir,
        device=args.device,
        explain=args.explain,
        ig_steps=args.ig_steps,
    )

    compact_result: dict[str, Any] = {
        "pred_class_id": result["pred_class_id"],
        "pred_class_name": result["pred_class_name"],
        "class_probs": result["class_probs"],
        "source": result["source"],
    }
    if args.explain:
        compact_result["visualization"] = {
            "peaks": result["visualization"]["peaks"],
            "important_regions": result["visualization"]["important_regions"],
        }

    if not args.include_arrays:
        json_payload = json.dumps(_to_jsonable(compact_result), ensure_ascii=True, indent=2)
    else:
        json_payload = json.dumps(_to_jsonable(result), ensure_ascii=True, indent=2)

    if args.json:
        print(json_payload)
    else:
        probs = result["class_probs"]
        print(f"pred_class={result['pred_class_name']}")
        print(f"control={float(probs['control']):.4f}")
        print(f"exo={float(probs['exo']):.4f}")
        print(f"endo={float(probs['endo']):.4f}")

    if args.output_json is not None:
        output_path = Path(args.output_json)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(_to_jsonable(result), ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
