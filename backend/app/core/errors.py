from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []
        self.headers = headers or {}
        super().__init__(message)


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "")
    payload: dict[str, Any] = {
        "error": {
            "code": exc.code,
            "message": exc.message,
        },
        "requestId": request_id,
    }
    if exc.details:
        payload["error"]["details"] = exc.details

    response = JSONResponse(status_code=exc.status_code, content=payload)
    for key, value in exc.headers.items():
        response.headers[key] = value
    return response
