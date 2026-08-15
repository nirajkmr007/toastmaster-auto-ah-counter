#!/usr/bin/env bash
#
# Repack the Indian-English Vosk model for use in the browser, then verify it
# will actually work with this app.
#
# WHY THIS EXISTS
#   alphacephei publishes models as .zip. vosk-browser loads models only as
#   gzipped tar archives ("The library loads models as gzipped tar archives of a
#   model folder" — vosk-browser README). So the .zip URL cannot be used
#   directly; it has to be converted once and hosted somewhere that sends CORS
#   headers. A GitHub Release asset on this repo does both, and keeps the 36 MB
#   binary out of git history.
#
# WHAT IT CHECKS (this is the important part)
#   1. The archive has the layout vosk-browser expects.
#   2. Recognizer B's grammar words (um, uh, er, ah, hmm, …) exist in the
#      model's vocabulary. If they don't, the sound counter silently dies —
#      a grammar can only contain in-vocabulary words.
#   3. The profanity blocklist still lines up with this model's vocabulary.
#      The shipped list was intersected against en-US; en-IN is a different
#      vocabulary, so coverage has to be re-confirmed rather than assumed.
#
# USAGE
#   ./scripts/repack-en-in-model.sh                 # download, repack, verify
#   ./scripts/repack-en-in-model.sh --keep-extract  # also leave the model dir
#
# Then upload the resulting .tar.gz as a GitHub Release asset:
#   gh release create models-v1 dist-models/vosk-model-small-en-in-0.4.tar.gz \
#     --title "Browser model bundles" \
#     --notes "vosk-browser-compatible tar.gz repack of vosk-model-small-en-in-0.4"
#
# ...and put the asset's browser_download_url into EN_IN_MODEL_URL in
# src/audio/models.ts.

set -euo pipefail

ZIP_URL="https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip"
MODEL_NAME="vosk-model-small-en-in-0.4"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/scripts/.model-work"
OUT_DIR="$ROOT/dist-models"
KEEP_EXTRACT=0
[[ "${1:-}" == "--keep-extract" ]] && KEEP_EXTRACT=1

mkdir -p "$WORK" "$OUT_DIR"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' is required but not installed." >&2
    exit 1
  }
}
need curl
need unzip
need tar
need python3

ZIP="$WORK/$MODEL_NAME.zip"
if [[ -f "$ZIP" ]]; then
  echo "==> Using cached $ZIP"
else
  echo "==> Downloading $ZIP_URL (~36 MB)"
  curl -fL --progress-bar -o "$ZIP.part" "$ZIP_URL"
  mv "$ZIP.part" "$ZIP"
fi

echo "==> Extracting"
rm -rf "$WORK/$MODEL_NAME"
unzip -q "$ZIP" -d "$WORK"
[[ -d "$WORK/$MODEL_NAME" ]] || {
  echo "error: expected $WORK/$MODEL_NAME after unzip; archive layout changed." >&2
  exit 1
}

echo "==> Checking model layout"
# HCLG.fst (static graph) or HCLr.fst + Gr.fst (lookahead) are both valid.
for f in am/final.mdl conf/mfcc.conf conf/model.conf; do
  [[ -f "$WORK/$MODEL_NAME/$f" ]] || {
    echo "error: missing required file $f" >&2
    exit 1
  }
done
if [[ -f "$WORK/$MODEL_NAME/graph/HCLG.fst" ]]; then
  echo "    static graph (HCLG.fst)"
elif [[ -f "$WORK/$MODEL_NAME/graph/HCLr.fst" && -f "$WORK/$MODEL_NAME/graph/Gr.fst" ]]; then
  echo "    lookahead graph (HCLr.fst + Gr.fst)"
else
  echo "error: no usable decoding graph found in graph/" >&2
  exit 1
fi

echo "==> Verifying vocabulary (filler grammar + profanity coverage)"
python3 "$ROOT/scripts/verify-model-vocab.py" "$WORK/$MODEL_NAME"

TARBALL="$OUT_DIR/$MODEL_NAME.tar.gz"
echo "==> Packing $TARBALL"
# Archive must contain the model directory at its root, matching how
# vosk-browser's own hosted models are packed.
tar -czf "$TARBALL" -C "$WORK" "$MODEL_NAME"

if [[ $KEEP_EXTRACT -eq 0 ]]; then
  rm -rf "$WORK/$MODEL_NAME"
fi

SIZE="$(du -h "$TARBALL" | cut -f1)"
cat <<EOF

Done. $TARBALL ($SIZE)

Next:
  1. Upload it as a Release asset:
       gh release create models-v1 "$TARBALL" \\
         --title "Browser model bundles" \\
         --notes "vosk-browser tar.gz repack of $MODEL_NAME"
     (if the release already exists: gh release upload models-v1 "$TARBALL")

  2. Copy the asset URL into EN_IN_MODEL_URL in src/audio/models.ts:
       https://github.com/<owner>/<repo>/releases/download/models-v1/$MODEL_NAME.tar.gz

  3. Hard-reload the app and switch the accent toggle in Settings.

dist-models/ is gitignored — do not commit the tarball.
EOF
