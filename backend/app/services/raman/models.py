from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ParseStatus = Literal["success", "partial", "failed"]
Severity = Literal["info", "warning", "error"]
BandValue = Literal["1500", "2900", "unknown"]
BrainRegionValue = Literal["cortex", "striatum", "cerebellum", "other", "unknown"]
ClassLabelValue = Literal["control", "endo", "exo", "unknown"]
SideValue = Literal["left", "right", "unknown"]
DataMode = Literal["map", "single_spectrum"]


@dataclass
class Diagnostic:
    code: str
    severity: Severity
    message: str
    field: str | None = None


@dataclass
class Spectrum:
    wave: list[float]
    intensity: list[float]


@dataclass
class RamanPoint:
    point_key: str
    x: float
    y: float
    spectrum: Spectrum
    mean_intensity: float
    area_under_curve: float
    peak_intensity: float


@dataclass
class ParsedMetadata:
    source_file_name: str
    parse_status: ParseStatus
    band: BandValue = "unknown"
    brain_region: BrainRegionValue = "unknown"
    class_label: ClassLabelValue = "unknown"
    animal_id: str | None = None
    side: SideValue = "unknown"
    place: str | None = None
    repetition: str | None = None
    map_id: str | None = None
    diagnostics: list[Diagnostic] = field(default_factory=list)
    suggested_questions: list[str] = field(default_factory=list)
    user_confirmed: bool = False
    user_overrides: dict[str, str] = field(default_factory=dict)


@dataclass
class RamanMap:
    metadata: ParsedMetadata
    points: list[RamanPoint]
    spatial_map_available: bool
    data_mode: DataMode
    spectrum_count: int
    total_rows: int
    wave_min: float | None
    wave_max: float | None
    x_min: float | None
    x_max: float | None
    y_min: float | None
    y_max: float | None


@dataclass
class ParsedUpload:
    upload_id: str
    file_name: str
    metadata: ParsedMetadata
    raman_map: RamanMap | None
