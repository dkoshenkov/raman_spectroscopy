# Raman MIL Classification

Weakly supervised pipeline for Raman spectra / Raman maps classification with classes:

- `control`
- `exo`
- `endo`

The project contains:

- data loading and preprocessing aligned with [model.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/model.ipynb)
- PyTorch MIL training for Raman maps
- inference for a single spectrum
- attribution and important spectral region extraction
- notebooks for training review and inference demos

## Project Layout

- [data](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/data): source Raman `.txt` files
- [src/raman_mil](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/src/raman_mil): data, model, training, inference, explainability
- [src/train_mil.py](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/src/train_mil.py): training CLI
- [src/infer_single_spectrum.py](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/src/infer_single_spectrum.py): single-spectrum inference CLI
- [notebooks/model.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/model.ipynb): original baseline notebook
- [notebooks/raman_mil_check.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/raman_mil_check.ipynb): sanity checks
- [notebooks/raman_mil_train_and_results.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/raman_mil_train_and_results.ipynb): training and result review
- [notebooks/single_spectrum_inference.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/single_spectrum_inference.ipynb): inference examples for one spectrum
- [spectr_data](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/spectr_data): extracted example single-spectrum `.txt` files in 2-column format

## Environment

The project uses `uv`.

Install dependencies:

```bash
uv sync
```

If Jupyter does not see the project environment, select the kernel from `.venv`.

## Data Contract

Training data follows the contract from [model.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/model.ipynb):

- source maps are read from `data/**/*.txt`
- each training file contains 4 columns: `x y wave intensity`
- one file corresponds to one Raman map
- a map is flattened into many spectra
- labels exist only at map level during training

Single-spectrum inference uses a different input format:

- one `.txt` file
- 2 columns only: `wave intensity`

## Training

Main training entrypoint:

```bash
uv run python -m src.train_mil \
  --data-dir data \
  --output-dir artifacts/raman_mil_train_and_results \
  --center 1500
```

Important defaults:

- group-aware validation with `LeaveOneGroupOut`
- no metadata branch by default
- compact multiscale 1D CNN encoder
- Gated Attention MIL
- stage 1 inherited-label warmup
- stage 2 joint MIL training

Useful arguments:

- `--center 1500` or `--center 2900`
- `--batch-size`
- `--max-spectra-per-map`
- `--encoder-chunk-size`
- `--warmup-epochs`
- `--joint-epochs`
- `--device cpu` or `--device cuda`

## Training Outputs

Each run writes artifacts into the selected output directory:

- `summary.json`
- `oof_predictions.csv`
- `oof_confusion_matrix.png`
- `oof_confusion_matrix_cortex.png`
- `oof_confusion_matrix_striatum.png`
- `oof_confusion_matrix_cerebellum.png`
- `map_records.csv`
- `fold_*/best_model.pt`

## Single Spectrum Inference

### Python API

Use [infer_single_spectrum_file](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/src/raman_mil/inference.py):

```python
from src.raman_mil.inference import infer_single_spectrum_file

result = infer_single_spectrum_file(
    spectrum_path="spectr_data/spectrum_07_center1500_cortex_control_1group_633nm_center1500_obj100_power100_1s_5acc_map35x15_step2_place6_1_spec104.txt",
    center=1500,
    device="cpu",
    explain=True,
)
```

Returned fields:

- `pred_class_id`
- `pred_class_name`
- `class_probs`
- `visualization`
- `source`
- `debug`

`visualization` is ready for frontend usage:

- `visualization["spectrum"]`: processed spectrum curve
- `visualization["peaks"]`: extracted peaks
- `visualization["important_regions"]`: important spectral intervals
- `visualization["attribution"]`: attribution curve

### CLI

Short output:

```bash
uv run python -m src.infer_single_spectrum \
  spectr_data/spectrum_07_center1500_cortex_control_1group_633nm_center1500_obj100_power100_1s_5acc_map35x15_step2_place6_1_spec104.txt \
  --center 1500
```

Example output:

```text
pred_class=control
control=0.3442
exo=0.3276
endo=0.3282
```

JSON output to stdout:

```bash
uv run python -m src.infer_single_spectrum ... --center 1500 --json
```

Save full JSON:

```bash
uv run python -m src.infer_single_spectrum ... --center 1500 --output-json out.json
```

## Notebooks

### 1. Baseline reference

[model.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/model.ipynb)

Original notebook used as the source of truth for:

- data format
- preprocessing
- Raman map handling
- baseline CatBoost pipeline

### 2. Sanity checks

[raman_mil_check.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/raman_mil_check.ipynb)

Use this notebook to verify:

- dataset shapes
- forward pass
- smoke training
- checkpoint loading
- map and spectrum inference

### 3. Full training review

[raman_mil_train_and_results.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/raman_mil_train_and_results.ipynb)

Use this notebook to:

- launch training
- inspect OOF metrics
- inspect fold metrics
- review confusion matrices
- inspect per-tissue confusion matrices

### 4. Single-spectrum demo

[single_spectrum_inference.ipynb](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/notebooks/single_spectrum_inference.ipynb)

Shows:

- inference for one `1500` spectrum
- inference for one `2900` spectrum
- spectrum visualization
- peaks
- important regions
- attribution curve

## Example Files For Inference

The folder [spectr_data](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/spectr_data) contains extracted example single spectra in the required 2-column format.

Mapping to original source maps is stored in [manifest.csv](/home/yaroslav/progs/biohack/deeppick_mephi_2026/ml/spectr_data/manifest.csv).

## Notes

- `1500` and `2900` use separate final model directories.
- Default single-spectrum inference uses ensemble averaging over all `fold_*/best_model.pt` checkpoints in the corresponding artifact directory.
- Attribution is implemented with Integrated Gradients in pure PyTorch.
