# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml /app/backend/pyproject.toml
RUN uv sync --project /app/backend --no-dev

COPY backend /app/backend
COPY ml /app/ml
COPY scripts/backend /app/scripts/backend
RUN chmod +x /app/scripts/backend/*.sh

EXPOSE 8000
CMD ["/app/scripts/backend/run-prod.sh"]
