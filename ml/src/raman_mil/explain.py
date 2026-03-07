from __future__ import annotations

import torch
import numpy as np

from .data import id2target


@torch.no_grad()
def _default_baseline(spectrum: torch.Tensor) -> torch.Tensor:
    return torch.zeros_like(spectrum)


def integrated_gradients(
    model,
    spectrum: torch.Tensor,
    tissue_id: int | None = None,
    target_class: int | None = None,
    baseline: torch.Tensor | None = None,
    steps: int = 64,
    device: torch.device | None = None,
) -> dict[str, np.ndarray | int | str]:
    model.eval()
    if device is None:
        device = next(model.parameters()).device
    spectrum = spectrum.detach().float().to(device)
    if spectrum.ndim != 1:
        raise ValueError("integrated_gradients expects a 1D spectrum")
    if baseline is None:
        baseline = _default_baseline(spectrum)
    baseline = baseline.detach().float().to(device)

    if target_class is None:
        with torch.no_grad():
            tissue_tensor = torch.tensor([tissue_id], device=device) if tissue_id is not None else None
            pred = model.forward_instance(spectrum.unsqueeze(0), tissue_tensor)
            target_class = int(pred["probs"].argmax(dim=-1).item())

    total_grads = torch.zeros_like(spectrum)
    alphas = torch.linspace(0.0, 1.0, steps + 1, device=device)[1:]
    for alpha in alphas:
        x = baseline + alpha * (spectrum - baseline)
        x = x.clone().detach().requires_grad_(True)
        tissue_tensor = torch.tensor([tissue_id], device=device) if tissue_id is not None else None
        out = model.forward_instance(x.unsqueeze(0), tissue_tensor)
        score = out["logits"][0, target_class]
        grads = torch.autograd.grad(score, x, retain_graph=False, create_graph=False)[0]
        total_grads += grads.detach()

    avg_grads = total_grads / steps
    attributions = (spectrum - baseline) * avg_grads
    return {
        "target_class": target_class,
        "target_name": id2target[target_class],
        "attribution": attributions.detach().cpu().numpy(),
        "spectrum": spectrum.detach().cpu().numpy(),
        "baseline": baseline.detach().cpu().numpy(),
    }


def summarize_top_intervals(
    common_nu: np.ndarray,
    attribution: np.ndarray,
    min_run: int = 3,
    threshold_quantile: float = 0.9,
    top_n: int = 5,
) -> list[dict[str, float]]:
    if common_nu.shape[0] != attribution.shape[0]:
        raise ValueError("common_nu and attribution must have the same length")
    scores = np.abs(attribution)
    threshold = float(np.quantile(scores, threshold_quantile))
    strong = scores >= threshold
    intervals = []
    start = None
    for idx, flag in enumerate(strong):
        if flag and start is None:
            start = idx
        if (not flag or idx == len(strong) - 1) and start is not None:
            end = idx if flag and idx == len(strong) - 1 else idx - 1
            if end - start + 1 >= min_run:
                chunk_scores = scores[start : end + 1]
                peak_local = int(np.argmax(chunk_scores))
                peak_idx = start + peak_local
                intervals.append(
                    {
                        "start_idx": int(start),
                        "end_idx": int(end),
                        "start_nu": float(common_nu[start]),
                        "end_nu": float(common_nu[end]),
                        "peak_idx": int(peak_idx),
                        "peak_nu": float(common_nu[peak_idx]),
                        "score_sum": float(chunk_scores.sum()),
                        "score_max": float(chunk_scores.max()),
                    }
                )
            start = None
    intervals.sort(key=lambda item: (item["score_sum"], item["score_max"]), reverse=True)
    return intervals[:top_n]
