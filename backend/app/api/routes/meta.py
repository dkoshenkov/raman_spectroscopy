from __future__ import annotations

from time import monotonic

from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.schemas.openapi_models import HealthResponse

settings = get_settings()
router = APIRouter(tags=["meta"])


@router.get("/health", operation_id="health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    started = getattr(request.app.state, "started_at_monotonic", monotonic())
    uptime = max(0.0, monotonic() - started)
    return HealthResponse(ok=True, version=settings.app_version, uptimeSeconds=uptime)
