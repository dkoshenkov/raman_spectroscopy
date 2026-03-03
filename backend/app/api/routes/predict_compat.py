from __future__ import annotations

import hashlib
import random

from fastapi import APIRouter, File, UploadFile

from app.core.errors import ApiError

router = APIRouter(tags=["compat"])


@router.post("/predict", summary="Compatibility endpoint for frontend API mode")
async def predict(file: UploadFile = File(...)) -> dict[str, list[float]]:
    payload = await file.read()
    if not payload:
        raise ApiError(status_code=400, code="BAD_REQUEST", message="uploaded file is empty")

    digest = hashlib.sha256(payload).digest()
    seed = int.from_bytes(digest[:8], byteorder="big", signed=False)
    rng = random.Random(seed)

    count = min(200, max(20, len(payload) // 64))
    probabilities = [round(rng.random(), 6) for _ in range(count)]
    return {"probabilities": probabilities}
