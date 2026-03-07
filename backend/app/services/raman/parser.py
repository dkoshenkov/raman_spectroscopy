from __future__ import annotations

import re
from dataclasses import replace
from uuid import uuid4

from app.services.raman.models import Diagnostic, ParsedMetadata, ParsedUpload, RamanMap, RamanPoint, Spectrum

COLUMN_SYNONYMS: dict[str, set[str]] = {
    "x": {"x", "coordx", "xcoord", "positionx", "posx"},
    "y": {"y", "coordy", "ycoord", "positiony", "posy"},
    "wave": {"wave", "ramanshift", "shift", "wavenumber", "wn", "wavelength"},
    "intensity": {"intensity", "signal", "counts", "count", "value", "au"},
}
FILENAME_BAND_HINTS = {
    "1500": re.compile(r"(center)?1500", re.IGNORECASE),
    "2900": re.compile(r"(center)?2900", re.IGNORECASE),
}
REGION_PATTERNS: dict[str, re.Pattern[str]] = {
    "cortex": re.compile(r"cort(?:ex|ical)?", re.IGNORECASE),
    "striatum": re.compile(r"striat(?:um|al)?", re.IGNORECASE),
    "cerebellum": re.compile(r"cerebell(?:um|ar)?", re.IGNORECASE),
    "other": re.compile(r"\bother\b", re.IGNORECASE),
}
CLASS_PATTERNS: dict[str, re.Pattern[str]] = {
    "control": re.compile(r"\bcontrol\b|\bctrl\b", re.IGNORECASE),
    "endo": re.compile(r"\bendo\b", re.IGNORECASE),
    "exo": re.compile(r"\bexo\b", re.IGNORECASE),
}
SIDE_PATTERNS: dict[str, re.Pattern[str]] = {
    "left": re.compile(r"\bleft\b|\blt\b|(?:^|[_\-.])l(?:[_\-.]|$)", re.IGNORECASE),
    "right": re.compile(r"\bright\b|\brt\b|(?:^|[_\-.])r(?:[_\-.]|$)", re.IGNORECASE),
}
DELIMITER_SPLIT = re.compile(r"[\t ]+")
TOKEN_NORMALIZER = re.compile(r"[^a-z0-9]+")


def parse_raman_upload(file_name: str, payload: bytes) -> ParsedUpload:
    text = _decode_payload(payload)
    metadata = ParsedMetadata(source_file_name=file_name, parse_status="success")
    diagnostics: list[Diagnostic] = []

    records, layout = _parse_records(text, diagnostics)
    _extract_metadata_from_filename(file_name, metadata)

    if layout is None or not records:
        diagnostics.append(
            Diagnostic(
                code="NO_SPECTRAL_DATA",
                severity="error",
                message="В загруженном .txt файле не найдены ожидаемые строки Wave/Intensity.",
                field="file",
            )
        )
        metadata.parse_status = "failed"
        metadata.diagnostics = diagnostics
        metadata.suggested_questions = _build_suggested_questions(metadata, spatial_map_available=False)
        return ParsedUpload(upload_id=str(uuid4()), file_name=file_name, metadata=metadata, raman_map=None)

    raman_map = _build_raman_map(file_name, metadata, records, layout["spatial"], diagnostics)
    metadata = raman_map.metadata
    return ParsedUpload(upload_id=str(uuid4()), file_name=file_name, metadata=metadata, raman_map=raman_map)


def _decode_payload(payload: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("utf-8", errors="replace")


def _normalize_token(token: str) -> str:
    token = token.lstrip("#").strip().lower()
    return TOKEN_NORMALIZER.sub("", token)


def _detect_header(tokens: list[str]) -> dict[str, int] | None:
    normalized = [_normalize_token(token) for token in tokens]
    mapping: dict[str, int] = {}
    for index, token in enumerate(normalized):
        for canonical, synonyms in COLUMN_SYNONYMS.items():
            if token in synonyms and canonical not in mapping:
                mapping[canonical] = index
    if {"wave", "intensity"}.issubset(mapping):
        return mapping
    return None


def _parse_records(text: str, diagnostics: list[Diagnostic]) -> tuple[list[dict[str, float]], dict[str, bool] | None]:
    lines = text.splitlines()
    header_mapping: dict[str, int] | None = None
    spatial = True
    records: list[dict[str, float]] = []
    malformed_lines: list[int] = []
    first_data_line: int | None = None

    for line_index, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue

        tokens = DELIMITER_SPLIT.split(stripped)

        if header_mapping is None:
            detected = _detect_header(tokens)
            if detected is not None:
                header_mapping = detected
                spatial = {"x", "y"}.issubset(header_mapping)
                if not spatial:
                    diagnostics.append(
                        Diagnostic(
                            code="SPATIAL_MAP_UNAVAILABLE",
                            severity="warning",
                            message="Столбцы X/Y отсутствуют, поэтому можно показать только одиночный спектр без пространственной карты.",
                            field="columns",
                        )
                    )
                continue

            if all(_is_float(token) for token in tokens):
                first_data_line = line_index
                if len(tokens) >= 4:
                    header_mapping = {"x": 0, "y": 1, "wave": 2, "intensity": 3}
                    spatial = True
                    diagnostics.append(
                        Diagnostic(
                            code="HEADER_INFERRED",
                            severity="warning",
                            message="Строка заголовка не найдена, поэтому столбцы были определены как X/Y/Wave/Intensity.",
                            field="columns",
                        )
                    )
                elif len(tokens) >= 2:
                    header_mapping = {"wave": 0, "intensity": 1}
                    spatial = False
                    diagnostics.append(
                        Diagnostic(
                            code="HEADER_INFERRED",
                            severity="warning",
                            message="Строка заголовка не найдена, поэтому столбцы были определены как Wave/Intensity.",
                            field="columns",
                        )
                    )
                    diagnostics.append(
                        Diagnostic(
                            code="SPATIAL_MAP_UNAVAILABLE",
                            severity="warning",
                            message="Столбцы X/Y отсутствуют, поэтому можно показать только одиночный спектр без пространственной карты.",
                            field="columns",
                        )
                    )
                else:
                    malformed_lines.append(line_index)
                if header_mapping is None:
                    continue
            elif stripped.startswith("#"):
                continue

        if header_mapping is None:
            continue

        if stripped.startswith("#") and _detect_header(tokens) is None:
            continue

        if first_data_line is None:
            first_data_line = line_index

        required_indexes = [header_mapping["wave"], header_mapping["intensity"]]
        if spatial:
            required_indexes.extend([header_mapping["x"], header_mapping["y"]])

        if max(required_indexes) >= len(tokens):
            malformed_lines.append(line_index)
            continue

        try:
            record = {
                "wave": float(tokens[header_mapping["wave"]]),
                "intensity": float(tokens[header_mapping["intensity"]]),
            }
            if spatial:
                record["x"] = float(tokens[header_mapping["x"]])
                record["y"] = float(tokens[header_mapping["y"]])
        except ValueError:
            malformed_lines.append(line_index)
            continue

        records.append(record)

    if malformed_lines:
        diagnostics.append(
            Diagnostic(
                code="MALFORMED_ROWS_SKIPPED",
                severity="warning" if records else "error",
                message=f"Пропущены некорректные строки: {', '.join(str(line) for line in malformed_lines[:8])}.",
                field="rows",
            )
        )

    if header_mapping is None:
        diagnostics.append(
            Diagnostic(
                code="EXPECTED_COLUMNS_NOT_FOUND",
                severity="error",
                message="В файле не найдены ожидаемые столбцы Wave и Intensity.",
                field="columns",
            )
        )
        return [], None

    return records, {"spatial": spatial}


def _is_float(token: str) -> bool:
    try:
        float(token)
    except ValueError:
        return False
    return True


def _extract_metadata_from_filename(file_name: str, metadata: ParsedMetadata) -> None:
    stem = file_name.rsplit(".", 1)[0]
    for band, pattern in FILENAME_BAND_HINTS.items():
        if pattern.search(stem):
            metadata.band = band
            break

    for region, pattern in REGION_PATTERNS.items():
        if pattern.search(stem):
            metadata.brain_region = region  # type: ignore[assignment]
            break

    for class_label, pattern in CLASS_PATTERNS.items():
        if pattern.search(stem):
            metadata.class_label = class_label  # type: ignore[assignment]
            break

    for side, pattern in SIDE_PATTERNS.items():
        if pattern.search(stem):
            metadata.side = side  # type: ignore[assignment]
            break

    metadata.animal_id = _match_group(stem, r"(?:animal|mouse|rat|id)[-_]?([a-z0-9]+)")
    metadata.place = _match_group(stem, r"(?:place|site|loc)[-_]?([a-z0-9]+)")
    metadata.repetition = _match_group(stem, r"(?:rep|repeat|repetition)[-_]?([a-z0-9]+)")
    metadata.map_id = _match_group(stem, r"(?:map)[-_]?([a-z0-9]+)")


def _match_group(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return None
    return match.group(1)


def _build_raman_map(
    file_name: str,
    metadata: ParsedMetadata,
    records: list[dict[str, float]],
    spatial: bool,
    diagnostics: list[Diagnostic],
) -> RamanMap:
    grouped: dict[str, list[tuple[float, float]]] = {}
    coordinate_index: dict[str, tuple[float, float]] = {}

    if spatial:
        for record in records:
            key = f"{record['x']:.9f}|{record['y']:.9f}"
            grouped.setdefault(key, []).append((record["wave"], record["intensity"]))
            coordinate_index[key] = (record["x"], record["y"])
    else:
        grouped["single-spectrum"] = [(record["wave"], record["intensity"]) for record in records]
        coordinate_index["single-spectrum"] = (0.0, 0.0)

    points: list[RamanPoint] = []
    total_rows = 0
    global_wave: list[float] = []
    x_values: list[float] = []
    y_values: list[float] = []
    duplicate_rows_collapsed = 0
    unsorted_spectra = 0

    for point_key, point_rows in grouped.items():
        if any(point_rows[index][0] < point_rows[index - 1][0] for index in range(1, len(point_rows))):
            unsorted_spectra += 1

        collapsed_rows, duplicates = _collapse_duplicate_waves(point_rows)
        duplicate_rows_collapsed += duplicates

        wave = [item[0] for item in collapsed_rows]
        intensity = [item[1] for item in collapsed_rows]
        total_rows += len(collapsed_rows)
        global_wave.extend(wave)
        x, y = coordinate_index[point_key]
        x_values.append(x)
        y_values.append(y)
        points.append(
            RamanPoint(
                point_key=point_key,
                x=x,
                y=y,
                spectrum=Spectrum(wave=wave, intensity=intensity),
                mean_intensity=sum(intensity) / len(intensity),
                area_under_curve=_trapezoid_area(wave, intensity),
                peak_intensity=max(intensity),
            )
        )

    points.sort(key=lambda point: (point.x, point.y, point.point_key))

    if duplicate_rows_collapsed:
        diagnostics.append(
            Diagnostic(
                code="DUPLICATE_WAVES_COLLAPSED",
                severity="warning",
                message=f"Схлопнуто {duplicate_rows_collapsed} строк с дублирующимися волновыми числами через усреднение интенсивности.",
                field="rows",
            )
        )
    if unsorted_spectra:
        diagnostics.append(
            Diagnostic(
                code="SPECTRA_SORTED",
                severity="warning",
                message=f"Перед визуализацией отсортировано {unsorted_spectra} спектров по Raman shift.",
                field="wave",
            )
        )

    detected_band = _detect_band_from_wave_range(min(global_wave), max(global_wave))
    if metadata.band != "unknown" and detected_band != "unknown" and metadata.band != detected_band:
        diagnostics.append(
            Diagnostic(
                code="BAND_CONFLICT",
                severity="warning",
                message=(
                    f"Имя файла указывает на диапазон {metadata.band}, но измеренный диапазон Wave "
                    f"({min(global_wave):.1f}-{max(global_wave):.1f} см^-1) соответствует диапазону {detected_band}."
                ),
                field="band",
            )
        )
    if detected_band != "unknown":
        metadata.band = detected_band
    elif metadata.band == "unknown":
        diagnostics.append(
            Diagnostic(
                code="BAND_UNKNOWN",
                severity="warning",
                message="Не удалось определить диапазон по диапазону Wave.",
                field="band",
            )
        )

    if metadata.brain_region == "unknown":
        diagnostics.append(
            Diagnostic(
                code="BRAIN_REGION_UNKNOWN",
                severity="warning",
                message="Не удалось определить область мозга по имени файла.",
                field="brain_region",
            )
        )

    metadata.parse_status = _derive_parse_status(diagnostics)
    metadata.diagnostics = diagnostics
    metadata.suggested_questions = _build_suggested_questions(metadata, spatial_map_available=spatial)

    return RamanMap(
        metadata=metadata,
        points=points,
        spatial_map_available=spatial,
        data_mode="single_spectrum" if len(points) == 1 else "map",
        spectrum_count=len(points),
        total_rows=total_rows,
        wave_min=min(global_wave) if global_wave else None,
        wave_max=max(global_wave) if global_wave else None,
        x_min=min(x_values) if spatial and x_values else None,
        x_max=max(x_values) if spatial and x_values else None,
        y_min=min(y_values) if spatial and y_values else None,
        y_max=max(y_values) if spatial and y_values else None,
    )


def _collapse_duplicate_waves(rows: list[tuple[float, float]]) -> tuple[list[tuple[float, float]], int]:
    buckets: dict[str, tuple[float, float, int]] = {}
    for wave, intensity in rows:
        key = f"{wave:.9f}"
        if key in buckets:
            prev_wave, intensity_sum, count = buckets[key]
            buckets[key] = (prev_wave, intensity_sum + intensity, count + 1)
        else:
            buckets[key] = (wave, intensity, 1)

    collapsed = [(wave, intensity_sum / count) for wave, intensity_sum, count in buckets.values()]
    collapsed.sort(key=lambda item: item[0])
    return collapsed, max(0, len(rows) - len(collapsed))


def _trapezoid_area(wave: list[float], intensity: list[float]) -> float:
    if len(wave) < 2:
        return float(intensity[0]) if intensity else 0.0
    total = 0.0
    for index in range(1, len(wave)):
        total += (wave[index] - wave[index - 1]) * (intensity[index] + intensity[index - 1]) / 2
    return total


def _detect_band_from_wave_range(wave_min: float, wave_max: float) -> str:
    if wave_min >= 900 and wave_max <= 2000:
        return "1500"
    if wave_min >= 2450 and wave_max <= 3300:
        return "2900"
    return "unknown"


def _derive_parse_status(diagnostics: list[Diagnostic]) -> str:
    if any(diagnostic.severity == "error" for diagnostic in diagnostics):
        return "failed"
    if diagnostics:
        return "partial"
    return "success"


def _build_suggested_questions(metadata: ParsedMetadata, spatial_map_available: bool) -> list[str]:
    questions: list[str] = []
    if metadata.band == "unknown":
        questions.append("Подтвердите, к какому Raman-диапазону относится файл: 1500 или 2900?")
    if metadata.brain_region == "unknown":
        questions.append("Уточните область мозга для этого измерения.")
    if not spatial_map_available:
        questions.append("В файле нет пространственных координат. Нужно ли трактовать его как одиночный спектр?")
    return questions


def apply_user_overrides(upload: ParsedUpload, overrides: dict[str, str | None]) -> ParsedUpload:
    metadata = replace(upload.metadata)
    metadata.user_confirmed = True
    metadata.user_overrides = {key: value for key, value in overrides.items() if value not in (None, "")}

    for key, value in overrides.items():
        if value in (None, "") or not hasattr(metadata, key):
            continue
        setattr(metadata, key, value)

    metadata.parse_status = "success" if upload.raman_map is not None else metadata.parse_status
    metadata.diagnostics = [
        diagnostic
        for diagnostic in metadata.diagnostics
        if diagnostic.code not in {"BAND_UNKNOWN", "BRAIN_REGION_UNKNOWN"}
    ]
    metadata.suggested_questions = []

    if upload.raman_map is None:
        return replace(upload, metadata=metadata)

    raman_map = replace(upload.raman_map, metadata=metadata)
    return replace(upload, metadata=metadata, raman_map=raman_map)
