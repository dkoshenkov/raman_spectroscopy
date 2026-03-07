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


class RamanClassProbabilityResponse(BaseModel):
    label: str
    probability: float


class RamanPeakResponse(BaseModel):
    peakIdx: int
    peakNu: float
    intensity: float
    prominence: float


class RamanImportantRegionResponse(BaseModel):
    startIdx: int
    endIdx: int
    startNu: float
    endNu: float
    peakIdx: int
    peakNu: float
    scoreSum: float
    scoreMax: float


class RamanSeriesResponse(BaseModel):
    x: list[float]
    y: list[float]
    label: str


class RamanPredictionResponse(BaseModel):
    uploadId: str
    pointKey: str
    predictedClass: str
    predictedClassId: int
    probabilities: list[RamanClassProbabilityResponse]
    processedSpectrum: RamanSeriesResponse
    attribution: RamanSeriesResponse | None = None
    peaks: list[RamanPeakResponse]
    importantRegions: list[RamanImportantRegionResponse]


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


def serialize_prediction(upload_id: str, point_key: str, prediction: dict) -> RamanPredictionResponse:
    probabilities = [
        RamanClassProbabilityResponse(label=label, probability=float(probability))
        for label, probability in sorted(
            prediction["class_probs"].items(),
            key=lambda item: float(item[1]),
            reverse=True,
        )
    ]
    peaks = [
        RamanPeakResponse(
            peakIdx=int(item["peak_idx"]),
            peakNu=float(item["peak_nu"]),
            intensity=float(item["intensity"]),
            prominence=float(item["prominence"]),
        )
        for item in prediction["visualization"]["peaks"]
    ]
    important_regions = [
        RamanImportantRegionResponse(
            startIdx=int(item["start_idx"]),
            endIdx=int(item["end_idx"]),
            startNu=float(item["start_nu"]),
            endNu=float(item["end_nu"]),
            peakIdx=int(item["peak_idx"]),
            peakNu=float(item["peak_nu"]),
            scoreSum=float(item["score_sum"]),
            scoreMax=float(item["score_max"]),
        )
        for item in prediction["visualization"]["important_regions"]
    ]
    attribution = prediction["visualization"].get("attribution")

    return RamanPredictionResponse(
        uploadId=upload_id,
        pointKey=point_key,
        predictedClass=prediction["pred_class_name"],
        predictedClassId=int(prediction["pred_class_id"]),
        probabilities=probabilities,
        processedSpectrum=RamanSeriesResponse(
            x=[float(value) for value in prediction["visualization"]["spectrum"]["x"]],
            y=[float(value) for value in prediction["visualization"]["spectrum"]["y"]],
            label=str(prediction["visualization"]["spectrum"]["label"]),
        ),
        attribution=(
            RamanSeriesResponse(
                x=[float(value) for value in attribution["x"]],
                y=[float(value) for value in attribution["y"]],
                label=str(attribution["label"]),
            )
            if attribution
            else None
        ),
        peaks=peaks,
        importantRegions=important_regions,
    )
