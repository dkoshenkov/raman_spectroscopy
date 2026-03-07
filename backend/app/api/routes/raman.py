from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.core.errors import ApiError
from app.schemas.raman import (
    RamanMetadataConfirmRequest,
    RamanSpectrumResponse,
    RamanUploadResponse,
    serialize_metadata,
    serialize_point,
    serialize_upload,
)
from app.services.raman import parse_raman_upload, upload_store

router = APIRouter(tags=["raman"])


@router.post("/raman/uploads/parse", response_model=RamanUploadResponse)
async def parse_upload(file: UploadFile = File(...)) -> RamanUploadResponse:
    if not file.filename:
        raise ApiError(status_code=400, code="BAD_REQUEST", message="требуется имя файла")
    if not file.filename.lower().endswith(".txt"):
        raise ApiError(status_code=400, code="BAD_REQUEST", message="поддерживается только один .txt файл")

    payload = await file.read()
    if not payload:
        raise ApiError(status_code=400, code="BAD_REQUEST", message="загруженный файл пуст")

    upload = upload_store.save(parse_raman_upload(file.filename, payload))
    return serialize_upload(upload)


@router.post("/raman/uploads/{upload_id}/confirm", response_model=RamanUploadResponse)
def confirm_upload(upload_id: str, payload: RamanMetadataConfirmRequest) -> RamanUploadResponse:
    upload = upload_store.get(upload_id)
    if upload is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="сессия загрузки не найдена")
    if upload.raman_map is None:
        raise ApiError(
            status_code=409,
            code="INVALID_STATE",
            message="загруженный файл не удалось нормализовать для визуализации",
        )

    confirmed = upload_store.confirm(upload_id, payload.model_dump(by_alias=False))
    if confirmed is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="сессия загрузки не найдена")
    return serialize_upload(confirmed)


@router.get("/raman/uploads/{upload_id}", response_model=RamanUploadResponse)
def get_upload(upload_id: str) -> RamanUploadResponse:
    upload = upload_store.get(upload_id)
    if upload is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="сессия загрузки не найдена")
    return serialize_upload(upload)


@router.get("/raman/uploads/{upload_id}/spectrum", response_model=RamanSpectrumResponse)
def get_spectrum(upload_id: str, point_key: str) -> RamanSpectrumResponse:
    upload = upload_store.get(upload_id)
    if upload is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="сессия загрузки не найдена")
    if upload.raman_map is None:
        raise ApiError(status_code=409, code="INVALID_STATE", message="для этой загрузки пространственная карта недоступна")

    point = next((item for item in upload.raman_map.points if item.point_key == point_key), None)
    if point is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="точка спектра не найдена")

    return RamanSpectrumResponse(
        uploadId=upload.upload_id,
        metadata=serialize_metadata(upload),
        point=serialize_point(point),
    )
