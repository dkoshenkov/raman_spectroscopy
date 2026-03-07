from __future__ import annotations

import argparse
import json
import os

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("KMP_INIT_AT_FORK", "FALSE")

from src.raman_mil.training import TrainingConfig, run_logo_training


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train weakly supervised Raman MIL classifier.")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--output-dir", default="artifacts/raman_mil")
    parser.add_argument("--center", type=int, default=1500)
    parser.add_argument("--preprocess-mode", default="clean")
    parser.add_argument("--use-metadata", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--max-spectra-per-map", type=int, default=128)
    parser.add_argument("--eval-chunk-size", type=int, default=128)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--encoder-chunk-size", type=int, default=32)
    parser.add_argument("--warmup-epochs", type=int, default=12)
    parser.add_argument("--joint-epochs", type=int, default=24)
    parser.add_argument("--learning-rate", type=float, default=5e-4)
    parser.add_argument("--weight-decay", type=float, default=3e-4)
    parser.add_argument("--top-k-ratio", type=float, default=0.03)
    parser.add_argument("--consistency-loss-weight", type=float, default=0.0)
    parser.add_argument("--bag-focal-gamma", type=float, default=1.0)
    parser.add_argument("--bag-label-smoothing", type=float, default=0.05)
    parser.add_argument("--instance-label-smoothing", type=float, default=0.05)
    parser.add_argument("--scheduler-patience", type=int, default=4)
    parser.add_argument("--scheduler-factor", type=float, default=0.5)
    parser.add_argument("--scheduler-min-lr", type=float, default=1e-6)
    parser.add_argument("--use-amp", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default=None)
    parser.add_argument("--fold-limit", type=int, default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = TrainingConfig(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        center=args.center,
        preprocess_mode=args.preprocess_mode,
        use_metadata=args.use_metadata,
        max_spectra_per_map=args.max_spectra_per_map,
        eval_chunk_size=args.eval_chunk_size,
        batch_size=args.batch_size,
        encoder_chunk_size=args.encoder_chunk_size,
        warmup_epochs=args.warmup_epochs,
        joint_epochs=args.joint_epochs,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        top_k_ratio=args.top_k_ratio,
        consistency_loss_weight=args.consistency_loss_weight,
        bag_focal_gamma=args.bag_focal_gamma,
        bag_label_smoothing=args.bag_label_smoothing,
        instance_label_smoothing=args.instance_label_smoothing,
        scheduler_patience=args.scheduler_patience,
        scheduler_factor=args.scheduler_factor,
        scheduler_min_lr=args.scheduler_min_lr,
        use_amp=args.use_amp,
        seed=args.seed,
        device=args.device or TrainingConfig().device,
        fold_limit=args.fold_limit,
    )
    summary = run_logo_training(config)
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
