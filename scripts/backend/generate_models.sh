#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
OUTPUT_FILE="$ROOT_DIR/backend/app/schemas/openapi_models.py"

uvx datamodel-codegen \
  --input "$ROOT_DIR/docs/openapi.yaml" \
  --input-file-type openapi \
  --output "$OUTPUT_FILE" \
  --output-model-type pydantic_v2.BaseModel \
  --target-python-version 3.11 \
  --use-standard-collections \
  --enum-field-as-literal all \
  --disable-timestamp

echo "Generated: $OUTPUT_FILE"
