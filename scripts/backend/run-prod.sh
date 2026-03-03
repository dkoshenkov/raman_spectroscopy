#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
PORT=${PORT:-8000}
WEB_THREADS=${WEB_THREADS:-2}
WEB_CONCURRENCY=${WEB_CONCURRENCY:-$(python3 -c 'import os; print(max(2, os.cpu_count() or 1))')}

exec uv run --project "$ROOT_DIR/backend" \
  gunicorn \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT}" \
  --workers "$WEB_CONCURRENCY" \
  --threads "$WEB_THREADS" \
  --chdir "$ROOT_DIR/backend" \
  app.main:app
