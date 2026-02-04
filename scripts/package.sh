#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/artifacts"
ZIP_PATH="$OUT_DIR/agent-bundle.zip"

mkdir -p "$OUT_DIR"

# Create run report if available
if [ -f "$ROOT_DIR/results/results-hybrid.json" ]; then
  node "$ROOT_DIR/scripts/make-report.js"
fi

# Build zip bundle
cd "$ROOT_DIR"

zip -r "$ZIP_PATH" \
  README.md \
  RUN-INSTRUCTIONS.md \
  RUN-REPORT.md \
  PLAN-LLM-HYBRID.md \
  config.json \
  package.json \
  package-lock.json \
  agent-bruteforce.js \
  utils \
  scripts \
  docs \
  results/results-hybrid.json \
  results/comparison.json \
  -x "node_modules/*" \
  -x "logs/*" \
  -x "artifacts/*" \
  -x ".git/*"

echo "Created $ZIP_PATH"
