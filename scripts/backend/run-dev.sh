#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
PORT=${PORT:-8000}

exec uv run --project "$ROOT_DIR/backend" \
  uvicorn app.main:app \
  --app-dir "$ROOT_DIR/backend" \
  --host 0.0.0.0 \
  --port "$PORT" \
  --reload
