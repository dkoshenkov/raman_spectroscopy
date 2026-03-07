from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import ConfusionMatrixDisplay, confusion_matrix

from .data import id2target


def plot_confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, output_path: str | Path, title: str) -> None:
    labels = [id2target[i] for i in sorted(id2target)]
    cm = confusion_matrix(y_true, y_pred, labels=sorted(id2target))
    fig, ax = plt.subplots(figsize=(6, 6))
    ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels).plot(ax=ax, colorbar=False)
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


def plot_training_history(history: dict[str, list[float]], output_path: str | Path, title: str) -> None:
    fig, ax = plt.subplots(figsize=(8, 4))
    for key, values in history.items():
        ax.plot(values, label=key)
    ax.set_title(title)
    ax.set_xlabel("epoch")
    ax.set_ylabel("value")
    ax.grid(True, alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


def plot_spectrum_attribution(
    common_nu: np.ndarray,
    spectrum: np.ndarray,
    attribution: np.ndarray,
    intervals: list[dict],
    output_path: str | Path,
    title: str,
) -> None:
    fig, axes = plt.subplots(2, 1, figsize=(10, 6), sharex=True)
    axes[0].plot(common_nu, spectrum, color="black", linewidth=1.2)
    axes[0].set_ylabel("intensity")
    axes[0].set_title(title)
    axes[1].plot(common_nu, attribution, color="tab:red", linewidth=1.0)
    axes[1].fill_between(common_nu, 0, attribution, color="tab:red", alpha=0.25)
    for interval in intervals:
        axes[1].axvspan(interval["start_nu"], interval["end_nu"], color="gold", alpha=0.2)
        axes[1].axvline(interval["peak_nu"], color="tab:blue", linestyle="--", linewidth=0.9)
    axes[1].set_ylabel("attribution")
    axes[1].set_xlabel("Raman shift")
    axes[1].grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


def plot_attention_weights(attention: np.ndarray, output_path: str | Path, title: str) -> None:
    fig, ax = plt.subplots(figsize=(9, 3))
    ax.plot(np.arange(len(attention)), attention, color="tab:green", linewidth=1.0)
    ax.set_title(title)
    ax.set_xlabel("spectrum index")
    ax.set_ylabel("attention")
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
