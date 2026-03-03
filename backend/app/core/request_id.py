from __future__ import annotations

from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings

settings = get_settings()


def build_request_id() -> str:
    return f"req_{uuid4().hex}"


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get(settings.request_id_header, "").strip() or build_request_id()
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers[settings.request_id_header] = request_id
        return response
