#!/usr/bin/env bash
# Alternative LM adaptation by INTERPOLATION — no external corpus needed.
#
# Instead of rebuilding the language model from a text corpus, this blends the
# model's OWN existing language model (its original Gr.fst = real English,
# already vocabulary-matched) with a small filler-only language model:
#
#     result = (1 - MIX) * original_English_LM  +  MIX * filler_LM
#
# The original English is preserved; MIX dials how much extra weight fillers
# get. This is the approach for "keep the model's English, just nudge fillers".
#
# Prereq: conda activate vosklm   (OpenFST + OpenGRM tools, incl. ngrammerge)
#
# Usage:
#   ./scripts/lm-adapt/interpolate-filler-lm.sh [MIX] [FILLER_LINES]
#     MIX          filler interpolation weight, 0..1 (default 0.10). Higher = more fillers.
#     FILLER_LINES size of the throwaway filler corpus used to build the filler LM (default 4000)
#
# Examples:
#   ./scripts/lm-adapt/interpolate-filler-lm.sh 0.05    # gentle
#   ./scripts/lm-adapt/interpolate-filler-lm.sh 0.15    # stronger filler boost
#
# Writes the SAME output as build-filler-model.sh, so the app's
# "Vosk small (en-US, filler-tuned)" entry picks up whichever you built last.
#
# NOTE: experimental. Interpolating a compiled Gr.fst is fiddly and depends on
# OpenGRM accepting the round-tripped model. If a step errors, the proven path
# is build-filler-model.sh (corpus dilution). Original grammar is backed up as
# Gr.fst.orig, so nothing is lost.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CACHE_DIR="$SCRIPT_DIR/.cache"

MIX="${1:-0.10}"
FILLER_LINES="${2:-4000}"
ORDER=3

MODEL_NAME="vosk-model-small-en-us-0.15"
BASE_URL="https://ccoreilly.github.io/vosk-browser/models/${MODEL_NAME}.tar.gz"
OUT_TARBALL="$REPO_ROOT/public/models/${MODEL_NAME}-fillers.tar.gz"

for bin in fstsymbols farcompilestrings ngramcount ngrammake ngrammerge fstconvert; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "Missing '$bin' on PATH. Run:  conda activate vosklm" >&2
    exit 1
  }
done

# OpenFST loads the 'ngram' FST type (Vosk's Gr.fst) from a plugin — make the
# conda plugin dir searchable, and symlink the .so to the .dylib name macOS
# looks for (same fix as rebuild-lm.sh).
if [ -n "${CONDA_PREFIX:-}" ]; then
  export LD_LIBRARY_PATH="$CONDA_PREFIX/lib/fst:$CONDA_PREFIX/lib:${LD_LIBRARY_PATH:-}"
  export DYLD_LIBRARY_PATH="$CONDA_PREFIX/lib/fst:$CONDA_PREFIX/lib:${DYLD_LIBRARY_PATH:-}"
  if [ -f "$CONDA_PREFIX/lib/fst/ngram-fst.so" ] && [ ! -e "$CONDA_PREFIX/lib/fst/ngram-fst.dylib" ]; then
    ln -sf "$CONDA_PREFIX/lib/fst/ngram-fst.so" "$CONDA_PREFIX/lib/fst/ngram-fst.dylib" 2>/dev/null || true
  fi
fi

WORK="$(mktemp -d)"
cleanup(){ if [ "${OK:-0}" = "1" ]; then rm -rf "$WORK"; else echo "Left work dir for inspection: $WORK" >&2; fi; }
trap cleanup EXIT

echo "==> [1/6] Fresh copy of the base model"
mkdir -p "$CACHE_DIR"
[ -f "$CACHE_DIR/${MODEL_NAME}.tar.gz" ] || curl -fSL "$BASE_URL" -o "$CACHE_DIR/${MODEL_NAME}.tar.gz"
tar xzf "$CACHE_DIR/${MODEL_NAME}.tar.gz" -C "$WORK"

GR="$(find "$WORK/$MODEL_NAME" -name 'Gr.fst' | head -n1)"
[ -n "$GR" ] || { echo "Gr.fst not found — needs a dynamic-graph small model." >&2; exit 1; }
GDIR="$(dirname "$GR")"
cd "$GDIR"
cp Gr.fst Gr.fst.orig

echo "==> [2/6] Extracting vocabulary + converting the original LM to a mergeable form"
fstsymbols --save_osymbols=words.txt Gr.fst > /dev/null
fstconvert --fst_type=vector Gr.fst > orig.mod.fst
if [ ! -s orig.mod.fst ]; then
  echo "" >&2
  echo "orig.mod.fst is empty: OpenFST could not convert this model's compiled" >&2
  echo "Gr.fst into a mergeable n-gram model. Interpolation needs the original" >&2
  echo "n-gram counts, which Vosk does not distribute — so this route is a dead" >&2
  echo "end for this model. Use the corpus-dilution path instead:" >&2
  echo "  ./scripts/lm-adapt/build-filler-model.sh '' 0.10 150000" >&2
  exit 1
fi

echo "==> [3/6] Generating a small filler corpus"
node "$SCRIPT_DIR/generate-corpus.mjs" "$WORK/filler.txt" "$FILLER_LINES" 3 >/dev/null

echo "==> [4/6] Building the filler language model (order $ORDER, same vocabulary)"
UNK="$(grep -m1 -oiE '^(\[unk\]|<unk>)' words.txt || true)"
UNKARG=()
[ -n "$UNK" ] && UNKARG=(--unknown_symbol="$UNK")
farcompilestrings --generate_keys=7 --fst_type=compact "${UNKARG[@]}" \
  --symbols=words.txt --keep_symbols "$WORK/filler.txt" \
  | ngramcount --order="$ORDER" \
  | ngrammake > filler.mod.fst

echo "==> [5/6] Interpolating: $(awk "BEGIN{print 1-$MIX}") * English  +  $MIX * fillers"
ALPHA="$(awk "BEGIN{print 1-$MIX}")"
ngrammerge --method=model_merge --normalize --alpha="$ALPHA" --beta="$MIX" \
  orig.mod.fst filler.mod.fst > merged.fst

echo "==> [6/6] Converting back to the runtime grammar + repackaging"
fstconvert --fst_type=ngram merged.fst > Gr.fst
rm -f orig.mod.fst filler.mod.fst merged.fst Gr.fst.orig
mkdir -p "$REPO_ROOT/public/models"
( cd "$WORK" && tar czf "${MODEL_NAME}-fillers.tar.gz" "$MODEL_NAME" )
mv -f "$WORK/${MODEL_NAME}-fillers.tar.gz" "$OUT_TARBALL"

OK=1
echo ""
echo "Done. Wrote $OUT_TARBALL"
echo "Reload the app, pick 'Vosk small (en-US, filler-tuned)', and compare."
echo "Too many fillers? lower MIX, e.g.: $0 0.05   |   too few? raise it: $0 0.20"
