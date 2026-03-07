from __future__ import annotations

from dataclasses import replace
from threading import Lock

from app.services.raman.models import ParsedUpload
from app.services.raman.parser import apply_user_overrides


class UploadStore:
    def __init__(self) -> None:
        self._items: dict[str, ParsedUpload] = {}
        self._lock = Lock()

    def save(self, upload: ParsedUpload) -> ParsedUpload:
        with self._lock:
            self._items[upload.upload_id] = upload
        return upload

    def get(self, upload_id: str) -> ParsedUpload | None:
        return self._items.get(upload_id)

    def confirm(self, upload_id: str, overrides: dict[str, str | None]) -> ParsedUpload | None:
        with self._lock:
            upload = self._items.get(upload_id)
            if upload is None:
                return None
            updated = apply_user_overrides(upload, overrides)
            self._items[upload_id] = updated
            return updated


upload_store = UploadStore()
