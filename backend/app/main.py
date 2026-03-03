from __future__ import annotations

from contextlib import asynccontextmanager
from time import monotonic

from fastapi import FastAPI

from app.api.routes import auth, items, meta, predict_compat
from app.core.config import get_settings
from app.core.errors import ApiError, api_error_handler
from app.core.request_id import RequestIdMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.started_at_monotonic = monotonic()
    yield


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(RequestIdMiddleware)
app.add_exception_handler(ApiError, api_error_handler)

app.include_router(meta.router)
app.include_router(auth.router)
app.include_router(items.router)
app.include_router(predict_compat.router)
