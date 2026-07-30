#!/usr/bin/env bash
# Rebuild a Vosk small-model language model (Gr.fst) from filler-heavy text so
# the decoder is more likely to emit um/uh/er/ah. Mirrors Vosk's official LM
# adaptation procedure: https://alphacephei.com/vosk/adaptation
#
# This does NOT retrain the acoustic model — it only re-weights the language
# model. It cannot add words that aren't already in the model's dictionary
# (um/uh/er/ah already are, so that's fine).
#
# ── One-time prerequisites (on a Linux box, not covered here) ──────────────
#   git clone https://github.com/kaldi-asr/kaldi
#   cd kaldi/tools && make -j"$(nproc)" && extras/install_opengrm.sh
#   export KALDI_ROOT=/absolute/path/to/kaldi
#
# ── Usage ──────────────────────────────────────────────────────────────────
#   KALDI_ROOT=/path/to/kaldi ./rebuild-lm.sh <extracted-model-dir> <text.txt>
#
# Replaces Gr.fst inside the model dir (original saved as Gr.fst.orig, so you
# can revert). Afterwards, repack the dir into a .tar.gz — see README.md.

set -euo pipefail

MODEL_DIR="${1:?Usage: rebuild-lm.sh <extracted-model-dir> <text.txt>}"
TEXT="${2:?Usage: rebuild-lm.sh <extracted-model-dir> <text.txt>}"

[ -d "$MODEL_DIR" ] || { echo "Model dir not found: $MODEL_DIR" >&2; exit 1; }
[ -f "$TEXT" ] || { echo "Text file not found: $TEXT" >&2; exit 1; }

# The script cd's into the model's graph dir later, so resolve the corpus to an
# absolute path now — otherwise a relative path stops resolving after the cd.
TEXT="$(cd "$(dirname "$TEXT")" && pwd)/$(basename "$TEXT")"

# The five tools can come from anywhere on PATH — conda-forge (recommended on
# macOS: `conda install -c conda-forge ngram openfst`) or a Kaldi tools build.
# If KALDI_ROOT is set and has them, prepend those; otherwise use PATH as-is.
if [ -n "${KALDI_ROOT:-}" ] && [ -d "$KALDI_ROOT/tools/openfst/bin" ]; then
  export PATH="$KALDI_ROOT/tools/openfst/bin:$KALDI_ROOT/tools/opengrm/bin:$PATH"
  FSTLIB="$KALDI_ROOT/tools/openfst/lib:$KALDI_ROOT/tools/openfst/lib/fst"
  export LD_LIBRARY_PATH="$FSTLIB:${LD_LIBRARY_PATH:-}"     # Linux
  export DYLD_LIBRARY_PATH="$FSTLIB:${DYLD_LIBRARY_PATH:-}" # macOS
fi

# Vosk's Gr.fst is an 'ngram'-type FST; OpenFST loads that type from a plugin
# (ngram-fst.{so,dylib}) via the library path. conda ships it under lib/fst,
# which the loader doesn't search by default — add it explicitly.
if [ -n "${CONDA_PREFIX:-}" ]; then
  CONDALIB="$CONDA_PREFIX/lib/fst:$CONDA_PREFIX/lib"
  export LD_LIBRARY_PATH="$CONDALIB:${LD_LIBRARY_PATH:-}"     # Linux
  export DYLD_LIBRARY_PATH="$CONDALIB:${DYLD_LIBRARY_PATH:-}" # macOS
  # conda-forge ships the plugin as .so even on macOS, but OpenFST dlopen's
  # '.dylib'. Symlink so the loader finds it (idempotent, harmless on Linux).
  if [ -f "$CONDA_PREFIX/lib/fst/ngram-fst.so" ] && \
     [ ! -e "$CONDA_PREFIX/lib/fst/ngram-fst.dylib" ]; then
    ln -sf "$CONDA_PREFIX/lib/fst/ngram-fst.so" \
           "$CONDA_PREFIX/lib/fst/ngram-fst.dylib" 2>/dev/null || true
  fi
fi

for bin in fstsymbols farcompilestrings ngramcount ngrammake fstconvert; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "Missing '$bin' on PATH." >&2
    echo "Easiest fix: conda install -c conda-forge ngram openfst  (then activate the env)." >&2
    echo "See scripts/lm-adapt/README.md." >&2
    exit 1
  }
done

# Dynamic-graph small models keep the swappable grammar as Gr.fst.
GR="$(find "$MODEL_DIR" -name 'Gr.fst' | head -n1)"
[ -n "$GR" ] || {
  echo "Gr.fst not found under $MODEL_DIR." >&2
  echo "This procedure only works on Vosk small (dynamic-graph) models." >&2
  exit 1
}
GDIR="$(dirname "$GR")"
echo "==> Found grammar at $GR"

cd "$GDIR"
[ -f Gr.fst.orig ] || cp Gr.fst Gr.fst.orig   # back up once, never overwrite

# Output symbol table (vocabulary) from the existing grammar.
fstsymbols --save_osymbols=words.txt Gr.fst > /dev/null

# Warn if any target filler is missing from the model vocabulary — the LM
# rebuild can re-weight existing words but cannot introduce new ones.
missing=0
for f in um uh er ah hmm; do
  # Match the symbol at the start of a line ("um   123"). Grep the file
  # directly (no awk|grep -q pipe, which trips SIGPIPE under `set -o pipefail`).
  if ! grep -qE "^${f}([[:space:]]|\$)" words.txt; then
    echo "WARN: '$f' is not in the model vocabulary — it can't be recognized." >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] && echo "==> All target fillers present in vocabulary."

# The corpus may contain words the model's dictionary doesn't have. Map those
# to the model's unknown token so compilation doesn't abort on the first OOV
# word. Detect whether the vocab uses [unk] or <unk>.
UNK="$(grep -m1 -oiE '^(\[unk\]|<unk>)' words.txt || true)"

echo "==> Building new grammar FST from $TEXT ..."
# --generate_keys=7 is required by OpenFST 1.8.x when compiling one FST per
# line (it numbers each utterance). --fst_type=compact keeps the FAR small.
if [ -n "$UNK" ]; then
  echo "==> Out-of-vocabulary words will map to '$UNK'"
  farcompilestrings --generate_keys=7 --fst_type=compact --unknown_symbol="$UNK" \
    --symbols=words.txt --keep_symbols "$TEXT" \
    | ngramcount | ngrammake | fstconvert --fst_type=ngram > Gr.new.fst
else
  echo "WARN: no [unk]/<unk> token in vocab — corpus must be fully in-vocabulary." >&2
  farcompilestrings --generate_keys=7 --fst_type=compact \
    --symbols=words.txt --keep_symbols "$TEXT" \
    | ngramcount | ngrammake | fstconvert --fst_type=ngram > Gr.new.fst
fi

mv Gr.new.fst Gr.fst
echo "==> Done. Gr.fst rebuilt (original saved as Gr.fst.orig)."
echo "    Revert with:  mv '$GDIR/Gr.fst.orig' '$GDIR/Gr.fst'"
echo "    Next: repack the model dir into a .tar.gz (see scripts/lm-adapt/README.md)."
