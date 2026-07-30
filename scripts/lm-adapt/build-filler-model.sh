#!/usr/bin/env bash
# One-shot builder for the filler-tuned Vosk model, using the "dilute with
# generic English" approach: a large real-English corpus dominates and fillers
# are a light garnish, so the model keeps recognizing normal words while
# catching more fillers. Re-run any time to retune.
#
# Prereqs:
#   1. Tools on PATH:                conda activate vosklm
#   2. A generic English corpus:     ./scripts/lm-adapt/fetch-generic-corpus.sh
#      (or supply your own plain-text file, one sentence per line)
#
# Usage:
#   ./scripts/lm-adapt/build-filler-model.sh [GENERIC_CORPUS] [FILLER_RATE] [MAX_LINES]
#
# Examples:
#   ./scripts/lm-adapt/build-filler-model.sh                       # uses .cache/generic-en.txt, 12% filler rate, 50k lines
#   ./scripts/lm-adapt/build-filler-model.sh my-corpus.txt 0.08    # your corpus, lighter filler touch
#
# FILLER_RATE is the balance knob: fraction of lines that get a filler. Lower =
# fewer phantom fillers. See docs/lm-fine-tuning-explained.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CACHE_DIR="$SCRIPT_DIR/.cache"

GENERIC="${1:-$CACHE_DIR/generic-en.txt}"
FILLER_RATE="${2:-0.12}"
MAX_LINES="${3:-50000}"

MODEL_NAME="vosk-model-small-en-us-0.15"
BASE_URL="https://ccoreilly.github.io/vosk-browser/models/${MODEL_NAME}.tar.gz"
OUT_TARBALL="$REPO_ROOT/public/models/${MODEL_NAME}-fillers.tar.gz"

if ! command -v ngramcount >/dev/null 2>&1; then
  echo "OpenFST/OpenGRM tools not found on PATH. Run:  conda activate vosklm" >&2
  echo "(see scripts/lm-adapt/README.md)" >&2
  exit 1
fi

if [ ! -f "$GENERIC" ]; then
  echo "Generic corpus not found: $GENERIC" >&2
  echo "Fetch one:  ./scripts/lm-adapt/fetch-generic-corpus.sh" >&2
  echo "...or pass your own plain-text file as the first argument." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CORPUS="$WORK/text.txt"

echo "==> [1/4] Mixing corpus: base='$GENERIC', filler rate=$FILLER_RATE, max lines=$MAX_LINES"
node "$SCRIPT_DIR/mix-corpus.mjs" "$GENERIC" "$CORPUS" "$MAX_LINES" "$FILLER_RATE" 1

echo "==> [2/4] Preparing a fresh copy of the base model"
mkdir -p "$CACHE_DIR"
if [ ! -f "$CACHE_DIR/${MODEL_NAME}.tar.gz" ]; then
  echo "    downloading base model (once; cached)"
  curl -fSL "$BASE_URL" -o "$CACHE_DIR/${MODEL_NAME}.tar.gz"
fi
tar xzf "$CACHE_DIR/${MODEL_NAME}.tar.gz" -C "$WORK"

echo "==> [3/4] Rebuilding the language model"
"$SCRIPT_DIR/rebuild-lm.sh" "$WORK/$MODEL_NAME" "$CORPUS"

echo "==> [4/4] Repackaging into public/models/"
find "$WORK/$MODEL_NAME" -name 'Gr.fst.orig' -delete
mkdir -p "$REPO_ROOT/public/models"
( cd "$WORK" && tar czf "${MODEL_NAME}-fillers.tar.gz" "$MODEL_NAME" )
mv -f "$WORK/${MODEL_NAME}-fillers.tar.gz" "$OUT_TARBALL"

SIZE="$(du -h "$OUT_TARBALL" | cut -f1 | tr -d ' ')"
echo ""
echo "Done. Wrote $OUT_TARBALL ($SIZE)"
echo "Reload the app, pick 'Vosk small (en-US, filler-tuned)', and compare."
echo "Still over-counting? Lower the rate, e.g.: $0 '$GENERIC' 0.06"
echo "Missing fillers?      Raise it,   e.g.: $0 '$GENERIC' 0.20"
