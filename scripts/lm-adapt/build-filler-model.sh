#!/usr/bin/env bash
# One-shot builder for the filler-tuned Vosk model. Runs the whole loop:
# generate corpus -> fetch base model -> rebuild LM -> repackage into
# public/models/. Re-run any time with different parameters to retune.
#
# Prereq: the OpenFST/OpenGRM tools must be on PATH. With conda:
#   conda activate vosklm
#
# Usage:
#   ./scripts/lm-adapt/build-filler-model.sh [LINES] [MAX_FILLERS_PER_SENTENCE]
#
# Examples:
#   ./scripts/lm-adapt/build-filler-model.sh              # 6000 lines, 1 filler  (gentle — fewer false positives)
#   ./scripts/lm-adapt/build-filler-model.sh 6000 3       # denser — higher recall, more over-counting
#
# Lower MAX_FILLERS = less aggressive = fewer phantom fillers. That's the main
# knob for the recall/precision balance (see docs/lm-fine-tuning-explained.md).

set -euo pipefail

LINES="${1:-6000}"
MAX_FILLERS="${2:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODEL_NAME="vosk-model-small-en-us-0.15"
BASE_URL="https://ccoreilly.github.io/vosk-browser/models/${MODEL_NAME}.tar.gz"
CACHE_DIR="$SCRIPT_DIR/.cache"
OUT_TARBALL="$REPO_ROOT/public/models/${MODEL_NAME}-fillers.tar.gz"

# Early check so we fail before downloading anything.
if ! command -v ngramcount >/dev/null 2>&1; then
  echo "OpenFST/OpenGRM tools not found on PATH." >&2
  echo "Activate the tool env first, e.g.:  conda activate vosklm" >&2
  echo "(see scripts/lm-adapt/README.md)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CORPUS="$WORK/text.txt"

echo "==> [1/4] Generating corpus: $LINES lines, up to $MAX_FILLERS filler(s) per sentence"
node "$SCRIPT_DIR/generate-corpus.mjs" "$CORPUS" "$LINES" "$MAX_FILLERS"

echo "==> [2/4] Preparing a fresh copy of the base model"
mkdir -p "$CACHE_DIR"
if [ ! -f "$CACHE_DIR/${MODEL_NAME}.tar.gz" ]; then
  echo "    downloading base model (once; cached in scripts/lm-adapt/.cache)"
  curl -fSL "$BASE_URL" -o "$CACHE_DIR/${MODEL_NAME}.tar.gz"
fi
# Always extract fresh so the LM is rebuilt from the ORIGINAL grammar, never a
# previously-rebuilt one (which would compound the tuning).
tar xzf "$CACHE_DIR/${MODEL_NAME}.tar.gz" -C "$WORK"

echo "==> [3/4] Rebuilding the language model"
"$SCRIPT_DIR/rebuild-lm.sh" "$WORK/$MODEL_NAME" "$CORPUS"

echo "==> [4/4] Repackaging into public/models/"
# Drop the backup the rebuild leaves behind so it doesn't bloat the shipped model.
find "$WORK/$MODEL_NAME" -name 'Gr.fst.orig' -delete
mkdir -p "$REPO_ROOT/public/models"
( cd "$WORK" && tar czf "${MODEL_NAME}-fillers.tar.gz" "$MODEL_NAME" )
mv -f "$WORK/${MODEL_NAME}-fillers.tar.gz" "$OUT_TARBALL"

SIZE="$(du -h "$OUT_TARBALL" | cut -f1)"
echo ""
echo "Done. Wrote $OUT_TARBALL ($SIZE)"
echo "Reload the app, pick 'Vosk small (en-US, filler-tuned)', and compare."
echo "Too many false fillers? Re-run with a lower density, e.g.: $0 6000 1"
