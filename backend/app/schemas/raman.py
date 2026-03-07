from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.services.raman.models import Diagnostic, ParsedUpload, RamanMap, RamanPoint

USER_OVERRIDE_ALIASES = {
    "brain_region": "brainRegion",
    "class_label": "classLabel",
    "animal_id": "animalId",
    "map_id": "mapId",
}


class DiagnosticResponse(BaseModel):
    code: str
    severity: str
    message: str
    field: str | None = None


class MetadataResponse(BaseModel):
    sourceFileName: str
    parseStatus: str
    band: str
    brainRegion: str
    classLabel: str
    animalId: str | None = None
    side: str
    place: str | None = None
    repetition: str | None = None
    mapId: str | None = None
    diagnostics: list[DiagnosticResponse]
    suggestedQuestions: list[str]
    userConfirmed: bool
    userOverrides: dict[str, str]


class RamanPointResponse(BaseModel):
    pointKey: str
    x: float
    y: float
    spectrumWave: list[float]
    spectrumIntensity: list[float]
    meanIntensity: float
    areaUnderCurve: float
    peakIntensity: float


class RamanMapResponse(BaseModel):
    spatialMapAvailable: bool
    dataMode: str
    spectrumCount: int
    totalRows: int
    waveMin: float | None = None
    waveMax: float | None = None
    xMin: float | None = None
    xMax: float | None = None
    yMin: float | None = None
    yMax: float | None = None
    points: list[RamanPointResponse]


class RamanUploadResponse(BaseModel):
    uploadId: str
    fileName: str
    metadata: MetadataResponse
    ramanMap: RamanMapResponse | None = None


class RamanMetadataConfirmRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    band: str = "unknown"
    brain_region: str = Field(default="unknown", alias="brainRegion")
    class_label: str = Field(default="unknown", alias="classLabel")
    animal_id: str | None = Field(default=None, alias="animalId")
    side: str = "unknown"
    place: str | None = None
    repetition: str | None = None
    map_id: str | None = Field(default=None, alias="mapId")


class RamanSpectrumResponse(BaseModel):
    uploadId: str
    metadata: MetadataResponse
    point: RamanPointResponse


def serialize_diagnostic(diagnostic: Diagnostic) -> DiagnosticResponse:
    return DiagnosticResponse(
        code=diagnostic.code,
        severity=diagnostic.severity,
        message=diagnostic.message,
        field=diagnostic.field,
    )


def serialize_metadata(upload: ParsedUpload) -> MetadataResponse:
    metadata = upload.metadata
    return MetadataResponse(
        sourceFileName=metadata.source_file_name,
        parseStatus=metadata.parse_status,
        band=metadata.band,
        brainRegion=metadata.brain_region,
        classLabel=metadata.class_label,
        animalId=metadata.animal_id,
        side=metadata.side,
        place=metadata.place,
        repetition=metadata.repetition,
        mapId=metadata.map_id,
        diagnostics=[serialize_diagnostic(item) for item in metadata.diagnostics],
        suggestedQuestions=metadata.suggested_questions,
        userConfirmed=metadata.user_confirmed,
        userOverrides={USER_OVERRIDE_ALIASES.get(key, key): value for key, value in metadata.user_overrides.items()},
    )


def serialize_point(point: RamanPoint) -> RamanPointResponse:
    return RamanPointResponse(
        pointKey=point.point_key,
        x=point.x,
        y=point.y,
        spectrumWave=point.spectrum.wave,
        spectrumIntensity=point.spectrum.intensity,
        meanIntensity=point.mean_intensity,
        areaUnderCurve=point.area_under_curve,
        peakIntensity=point.peak_intensity,
    )


def serialize_raman_map(raman_map: RamanMap) -> RamanMapResponse:
    return RamanMapResponse(
        spatialMapAvailable=raman_map.spatial_map_available,
        dataMode=raman_map.data_mode,
        spectrumCount=raman_map.spectrum_count,
        totalRows=raman_map.total_rows,
        waveMin=raman_map.wave_min,
        waveMax=raman_map.wave_max,
        xMin=raman_map.x_min,
        xMax=raman_map.x_max,
        yMin=raman_map.y_min,
        yMax=raman_map.y_max,
        points=[serialize_point(point) for point in raman_map.points],
    )


def serialize_upload(upload: ParsedUpload) -> RamanUploadResponse:
    return RamanUploadResponse(
        uploadId=upload.upload_id,
        fileName=upload.file_name,
        metadata=serialize_metadata(upload),
        ramanMap=serialize_raman_map(upload.raman_map) if upload.raman_map else None,
    )
