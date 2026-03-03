#!/usr/bin/env sh
set -eu

BASE_URL=${1:-http://localhost:8080}

check_status() {
  path="$1"
  expected="$2"
  status=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}${path}")
  if [ "$status" != "$expected" ]; then
    echo "FAIL ${path}: expected ${expected}, got ${status}"
    exit 1
  fi
  echo "OK   ${path}: ${status}"
}

check_status "/" "200"
check_status "/health" "200"
check_status "/api/health" "200"
check_status "/non-existent-route" "200"

assets=$(curl -sS "${BASE_URL}/" | sed -n 's/.*\(\/assets\/[^"]*\).*/\1/p' | sort -u)
if [ -z "$assets" ]; then
  echo "FAIL assets: no asset links found on index page"
  exit 1
fi

for asset in $assets; do
  check_status "$asset" "200"
done

echo "Smoke HTTP checks passed for ${BASE_URL}"
