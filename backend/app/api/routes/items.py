from __future__ import annotations

import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.errors import ApiError
from app.schemas.openapi_models import (
    Item,
    ItemCreateRequest,
    ItemListResponse,
    ItemPatchRequest,
)

router = APIRouter(tags=["items"])

_ITEMS: dict[str, Item] = {}


# Security stub: require Bearer token format, no external auth provider.
def require_bearer(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise ApiError(status_code=401, code="UNAUTHORIZED", message="missing bearer token")

    token = auth.removeprefix("Bearer ").strip()
    if len(token) < 8:
        raise ApiError(status_code=401, code="UNAUTHORIZED", message="invalid bearer token")
    return token


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _new_item_id() -> str:
    return f"itm_{secrets.token_urlsafe(9)}"


def _find_item_or_404(item_id: str) -> Item:
    item = _ITEMS.get(item_id)
    if item is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="item not found")
    return item


@router.get("/items", operation_id="listItems", response_model=ItemListResponse)
def list_items(
    _: str = Depends(require_bearer),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, min_length=1, max_length=200),
) -> ItemListResponse:
    items = sorted(_ITEMS.values(), key=lambda i: i.createdAt)
    if q:
        ql = q.lower()
        items = [item for item in items if ql in item.name.lower()]

    total = len(items)
    page = items[offset : offset + limit]
    return ItemListResponse(items=page, limit=limit, offset=offset, total=total)


@router.post("/items", operation_id="createItem", response_model=Item, status_code=201)
def create_item(payload: ItemCreateRequest, _: str = Depends(require_bearer)) -> Item:
    for existing in _ITEMS.values():
        if existing.name.casefold() == payload.name.casefold():
            raise ApiError(status_code=409, code="CONFLICT", message="item name already exists")

    now = _now()
    item = Item(
        id=_new_item_id(),
        name=payload.name,
        description=payload.description,
        createdAt=now,
        updatedAt=now,
    )
    _ITEMS[item.id] = item
    return item


@router.get("/items/{itemId}", operation_id="getItem", response_model=Item)
def get_item(itemId: str, _: str = Depends(require_bearer)) -> Item:
    return _find_item_or_404(itemId)


@router.patch("/items/{itemId}", operation_id="patchItem", response_model=Item)
def patch_item(itemId: str, payload: ItemPatchRequest, _: str = Depends(require_bearer)) -> Item:
    if payload.name is None and payload.description is None:
        raise ApiError(
            status_code=400,
            code="BAD_REQUEST",
            message="at least one field must be provided",
            details=[{"field": "body", "issue": "minProperties"}],
        )

    item = _find_item_or_404(itemId)

    if payload.name and payload.name.casefold() != item.name.casefold():
        for existing in _ITEMS.values():
            if existing.id != itemId and existing.name.casefold() == payload.name.casefold():
                raise ApiError(status_code=409, code="CONFLICT", message="item name already exists")

    updated = item.model_copy(
        update={
            "name": payload.name if payload.name is not None else item.name,
            "description": payload.description if payload.description is not None else item.description,
            "updatedAt": _now(),
        }
    )
    _ITEMS[itemId] = updated
    return updated


@router.delete("/items/{itemId}", operation_id="deleteItem", status_code=204)
def delete_item(itemId: str, _: str = Depends(require_bearer)) -> Response:
    _find_item_or_404(itemId)
    _ITEMS.pop(itemId, None)
    return Response(status_code=204)
