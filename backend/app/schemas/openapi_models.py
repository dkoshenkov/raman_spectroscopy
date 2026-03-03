"""OpenAPI-derived schema module.

Regenerate with scripts/backend/generate_models.sh.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HealthResponse(StrictModel):
    ok: bool
    version: str
    uptimeSeconds: float = Field(ge=0)


class LoginRequest(StrictModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(StrictModel):
    accessToken: str = Field(min_length=1)
    tokenType: str = "Bearer"
    expiresIn: int = Field(ge=1)


class Item(StrictModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{8,64}$")
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    createdAt: datetime
    updatedAt: datetime | None = None


class ItemCreateRequest(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class ItemPatchRequest(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class ItemListResponse(StrictModel):
    items: list[Item]
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
    total: int = Field(ge=0)


class ErrorDetail(StrictModel):
    field: str
    issue: str
    meta: dict[str, Any] | None = None


class ErrorObject(StrictModel):
    code: str
    message: str
    details: list[ErrorDetail] | None = None


class ErrorResponse(StrictModel):
    error: ErrorObject
    requestId: str
