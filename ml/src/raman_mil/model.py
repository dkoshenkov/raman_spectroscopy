from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

import torch
from torch import nn
import torch.nn.functional as F


@dataclass
class RamanMILConfig:
    input_length: int
    num_classes: int = 3
    encoder_dim: int = 128
    stem_channels: int = 32
    branch_channels: int = 32
    metadata_vocab_size: int = 3
    metadata_dim: int = 8
    use_metadata: bool = True
    dropout: float = 0.15
    attention_dim: int = 128
    encoder_chunk_size: int | None = 256
    norm_type: Literal["group"] = "group"
    group_norm_groups: int = 8

    def to_dict(self) -> dict:
        return asdict(self)


def _make_group_norm(num_channels: int, requested_groups: int) -> nn.GroupNorm:
    groups = min(requested_groups, num_channels)
    while num_channels % groups != 0 and groups > 1:
        groups -= 1
    return nn.GroupNorm(groups, num_channels)


class ResidualBlock1D(nn.Module):
    def __init__(self, channels: int, kernel_size: int, dropout: float, group_norm_groups: int) -> None:
        super().__init__()
        padding = kernel_size // 2
        self.conv1 = nn.Conv1d(channels, channels, kernel_size, padding=padding, bias=False)
        self.norm1 = _make_group_norm(channels, group_norm_groups)
        self.conv2 = nn.Conv1d(channels, channels, kernel_size, padding=padding, bias=False)
        self.norm2 = _make_group_norm(channels, group_norm_groups)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = x
        out = self.conv1(x)
        out = self.norm1(out)
        out = F.gelu(out)
        out = self.dropout(out)
        out = self.conv2(out)
        out = self.norm2(out)
        out = self.dropout(out)
        return F.gelu(out + identity)


class SpectrumEncoder(nn.Module):
    def __init__(
        self,
        encoder_dim: int = 128,
        stem_channels: int = 32,
        branch_channels: int = 32,
        dropout: float = 0.15,
        metadata_vocab_size: int = 3,
        metadata_dim: int = 8,
        use_metadata: bool = True,
        group_norm_groups: int = 8,
    ) -> None:
        super().__init__()
        if use_metadata and metadata_vocab_size <= 0:
            raise ValueError("metadata_vocab_size must be positive when use_metadata=True")
        self.use_metadata = use_metadata
        self.stem = nn.Sequential(
            nn.Conv1d(1, stem_channels, kernel_size=7, padding=3, bias=False),
            _make_group_norm(stem_channels, group_norm_groups),
            nn.GELU(),
            nn.Conv1d(stem_channels, stem_channels, kernel_size=5, padding=2, bias=False),
            _make_group_norm(stem_channels, group_norm_groups),
            nn.GELU(),
        )
        branch_kernels = (3, 7, 15)
        self.branches = nn.ModuleList()
        for kernel_size in branch_kernels:
            self.branches.append(
                nn.Sequential(
                    nn.Conv1d(stem_channels, branch_channels, kernel_size=kernel_size, padding=kernel_size // 2, bias=False),
                    _make_group_norm(branch_channels, group_norm_groups),
                    nn.GELU(),
                    ResidualBlock1D(
                        branch_channels,
                        kernel_size=kernel_size,
                        dropout=dropout,
                        group_norm_groups=group_norm_groups,
                    ),
                )
            )
        merged_channels = branch_channels * len(branch_kernels)
        self.merge = nn.Sequential(
            nn.Conv1d(merged_channels, encoder_dim, kernel_size=1, bias=False),
            _make_group_norm(encoder_dim, group_norm_groups),
            nn.GELU(),
            nn.Dropout(dropout),
        )
        self.metadata_embedding = nn.Embedding(metadata_vocab_size, metadata_dim) if use_metadata else None
        proj_in = encoder_dim * 2 + (metadata_dim if use_metadata else 0)
        self.output = nn.Sequential(
            nn.Linear(proj_in, encoder_dim),
            nn.LayerNorm(encoder_dim),
            nn.GELU(),
            nn.Dropout(dropout),
        )

    def forward(self, spectra: torch.Tensor, tissue_ids: torch.Tensor | None = None) -> torch.Tensor:
        if spectra.ndim != 2:
            raise ValueError(f"Expected [N, L] spectra, got shape {tuple(spectra.shape)}")
        x = spectra.unsqueeze(1)
        x = self.stem(x)
        x = torch.cat([branch(x) for branch in self.branches], dim=1)
        x = self.merge(x)
        avg_pool = x.mean(dim=-1)
        max_pool = x.amax(dim=-1)
        feats = torch.cat([avg_pool, max_pool], dim=-1)
        if self.use_metadata:
            if tissue_ids is None:
                raise ValueError("tissue_ids are required when use_metadata=True")
            meta = self.metadata_embedding(tissue_ids.long())
            feats = torch.cat([feats, meta], dim=-1)
        return self.output(feats)


class InstanceHead(nn.Module):
    def __init__(self, in_dim: int, num_classes: int, dropout: float) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, in_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(in_dim, num_classes),
        )

    def forward(self, embeddings: torch.Tensor) -> torch.Tensor:
        return self.net(embeddings)


class GatedAttentionMIL(nn.Module):
    def __init__(self, embed_dim: int, attention_dim: int, num_classes: int, dropout: float) -> None:
        super().__init__()
        self.attention_v = nn.Sequential(nn.Linear(embed_dim, attention_dim), nn.Tanh())
        self.attention_u = nn.Sequential(nn.Linear(embed_dim, attention_dim), nn.Sigmoid())
        self.attention_w = nn.Linear(attention_dim, 1)
        self.classifier = nn.Sequential(
            nn.Linear(embed_dim, embed_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(embed_dim, num_classes),
        )

    def forward(self, embeddings: torch.Tensor, mask: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        attn_logits = self.attention_w(self.attention_v(embeddings) * self.attention_u(embeddings)).squeeze(-1)
        attn_logits = attn_logits.masked_fill(~mask, float("-inf"))
        attention = torch.softmax(attn_logits, dim=1)
        pooled = torch.sum(embeddings * attention.unsqueeze(-1), dim=1)
        logits = self.classifier(pooled)
        return logits, attention, pooled


class RamanMILModel(nn.Module):
    def __init__(self, config: RamanMILConfig) -> None:
        super().__init__()
        self.config = config
        if config.norm_type != "group":
            raise ValueError(f"Unsupported norm_type={config.norm_type}")
        self.encoder = SpectrumEncoder(
            encoder_dim=config.encoder_dim,
            stem_channels=config.stem_channels,
            branch_channels=config.branch_channels,
            dropout=config.dropout,
            metadata_vocab_size=config.metadata_vocab_size,
            metadata_dim=config.metadata_dim,
            use_metadata=config.use_metadata,
            group_norm_groups=config.group_norm_groups,
        )
        self.instance_head = InstanceHead(config.encoder_dim, config.num_classes, config.dropout)
        self.mil_head = GatedAttentionMIL(config.encoder_dim, config.attention_dim, config.num_classes, config.dropout)

    def _encode_padded(self, spectra: torch.Tensor, mask: torch.Tensor, tissue_ids: torch.Tensor | None) -> tuple[torch.Tensor, torch.Tensor]:
        batch_size, num_instances, spec_dim = spectra.shape
        flat_spectra = spectra[mask]
        if flat_spectra.numel() == 0:
            raise ValueError("Encountered empty bag batch")
        flat_tissues = None
        if self.config.use_metadata:
            if tissue_ids is None:
                raise ValueError("tissue_ids required for metadata-aware model")
            flat_tissues = torch.repeat_interleave(tissue_ids.long(), mask.sum(dim=1))
        flat_spectra = flat_spectra.view(-1, spec_dim)

        chunk_size = self.config.encoder_chunk_size
        if chunk_size is None or chunk_size <= 0 or flat_spectra.shape[0] <= chunk_size:
            flat_embeddings = self.encoder(flat_spectra, flat_tissues)
            flat_logits = self.instance_head(flat_embeddings)
        else:
            embedding_chunks = []
            logit_chunks = []
            for start in range(0, flat_spectra.shape[0], chunk_size):
                stop = min(start + chunk_size, flat_spectra.shape[0])
                spectra_chunk = flat_spectra[start:stop]
                tissue_chunk = flat_tissues[start:stop] if flat_tissues is not None else None
                embed_chunk = self.encoder(spectra_chunk, tissue_chunk)
                logit_chunk = self.instance_head(embed_chunk)
                embedding_chunks.append(embed_chunk)
                logit_chunks.append(logit_chunk)
            flat_embeddings = torch.cat(embedding_chunks, dim=0)
            flat_logits = torch.cat(logit_chunks, dim=0)

        embeddings = torch.zeros(
            batch_size,
            num_instances,
            flat_embeddings.shape[-1],
            device=spectra.device,
            dtype=flat_embeddings.dtype,
        )
        logits = torch.zeros(
            batch_size,
            num_instances,
            flat_logits.shape[-1],
            device=spectra.device,
            dtype=flat_logits.dtype,
        )
        embeddings[mask] = flat_embeddings
        logits[mask] = flat_logits
        return embeddings, logits

    def forward_bag(
        self,
        spectra: torch.Tensor,
        mask: torch.Tensor,
        tissue_ids: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        embeddings, instance_logits = self._encode_padded(spectra, mask, tissue_ids)
        bag_logits, attention, bag_embedding = self.mil_head(embeddings, mask)
        instance_probs = torch.softmax(instance_logits, dim=-1)
        attn_instance_probs = torch.sum(instance_probs * attention.unsqueeze(-1), dim=1)
        return {
            "bag_logits": bag_logits,
            "bag_probs": torch.softmax(bag_logits, dim=-1),
            "bag_embedding": bag_embedding,
            "attention": attention,
            "instance_embeddings": embeddings,
            "instance_logits": instance_logits,
            "instance_probs": instance_probs,
            "attention_weighted_instance_probs": attn_instance_probs,
        }

    def forward_instance(
        self,
        spectra: torch.Tensor,
        tissue_ids: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        if spectra.ndim == 1:
            spectra = spectra.unsqueeze(0)
        embeddings = self.encoder(spectra, tissue_ids.long() if tissue_ids is not None else None)
        logits = self.instance_head(embeddings)
        return {
            "embeddings": embeddings,
            "logits": logits,
            "probs": torch.softmax(logits, dim=-1),
        }
