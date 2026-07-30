#!/usr/bin/env bash
# Download a large, modern English sentence corpus (Tatoeba, CC-BY) to use as
# the generic base for LM adaptation. Writes a plain one-sentence-per-line file
# to scripts/lm-adapt/.cache/generic-en.txt.
#
# You can skip this entirely and supply your OWN plain-text corpus to
# build-filler-model.sh instead — any large English text, one sentence per line.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="$SCRIPT_DIR/.cache"
OUT="$CACHE_DIR/generic-en.txt"
ARCHIVE="$CACHE_DIR/eng_sentences.tsv.bz2"
URL="https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2"

mkdir -p "$CACHE_DIR"

if [ -f "$OUT" ]; then
  echo "Already have $OUT ($(wc -l < "$OUT" | tr -d ' ') sentences)."
  echo "Delete it to rebuild from the archive."
  exit 0
fi

# Prefer a local archive if one is already present (in .cache or dropped next
# to the scripts) — no download needed. Otherwise fall back to Tatoeba.
LOCAL_ARCHIVE=""
for cand in "$ARCHIVE" "$SCRIPT_DIR/eng_sentences.tsv.bz2"; do
  if [ -f "$cand" ]; then LOCAL_ARCHIVE="$cand"; break; fi
done

if [ -n "$LOCAL_ARCHIVE" ]; then
  echo "==> Using local archive: $LOCAL_ARCHIVE (no download)"
else
  echo "==> No local archive found — downloading Tatoeba English sentences (~20 MB) ..."
  if ! curl -fSL "$URL" -o "$ARCHIVE"; then
    echo "" >&2
    echo "Download failed — Tatoeba's layout may have changed, or you're offline." >&2
    echo "Alternative: drop eng_sentences.tsv.bz2 into scripts/lm-adapt/.cache/," >&2
    echo "or supply your own plain-text corpus and pass its path to build-filler-model.sh." >&2
    exit 1
  fi
  LOCAL_ARCHIVE="$ARCHIVE"
fi

echo "==> Extracting the sentence column ..."
# The TSV columns are: id <tab> lang <tab> text — we want column 3.
bzip2 -dc "$LOCAL_ARCHIVE" | cut -f3 > "$OUT"

echo "Wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') sentences)."
