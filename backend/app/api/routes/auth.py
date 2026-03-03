from __future__ import annotations

from fastapi import APIRouter

from app.core.errors import ApiError
from app.schemas.openapi_models import LoginRequest, TokenResponse

router = APIRouter(tags=["auth"])


@router.post("/auth/login", operation_id="login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    if not payload.username.strip() or not payload.password.strip():
        raise ApiError(status_code=401, code="UNAUTHORIZED", message="invalid credentials")

    return TokenResponse(
        accessToken=f"dev-token-{payload.username}",
        tokenType="Bearer",
        expiresIn=3600,
    )
