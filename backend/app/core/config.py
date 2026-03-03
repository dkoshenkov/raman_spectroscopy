from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = "Example Async API"
    app_version: str = "0.1.0"
    request_id_header: str = "X-Request-Id"


def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "Example Async API"),
        app_version=os.getenv("APP_VERSION", "0.1.0"),
        request_id_header=os.getenv("REQUEST_ID_HEADER", "X-Request-Id"),
    )
