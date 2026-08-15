#!/usr/bin/env python3
"""
Verify a Vosk model against this app's two vocabulary-dependent assumptions.

Recognizer B works by restricting the model's grammar to the filler sounds. A
Kaldi grammar can only contain words the model actually has symbols for, so a
filler missing from the vocabulary is a filler that can never be counted. And
the profanity blocklist was intersected against the en-US vocabulary — a
different model means different coverage.

Both facts are invisible at runtime (no crash, just silence), which is exactly
why they get checked here instead of being discovered in a live meeting.

Usage:
    ./scripts/verify-model-vocab.py path/to/vosk-model-dir
    ./scripts/verify-model-vocab.py path/to/model.tar.gz

Exit code is non-zero if a filler sound is missing from the vocabulary.
"""

from __future__ import annotations

import os
import re
import struct
import sys
import tarfile
import tempfile

# OpenFst SymbolTable header marker; the word list is stored as the FST's
# symbol table, and small Vosk models ship no plain words.txt.
SYMBOL_TABLE_MAGIC = 2125658996
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_symbol_table(fst_path: str) -> set[str]:
    """Parse the word symbol table out of an OpenFst binary."""
    with open(fst_path, "rb") as fh:
        data = fh.read()

    marker = struct.pack("<i", SYMBOL_TABLE_MAGIC)
    pos = data.find(marker)
    if pos < 0:
        raise SystemExit(f"error: no symbol table found in {fst_path}")

    p = pos + 4
    name_len = struct.unpack_from("<i", data, p)[0]
    p += 4 + name_len
    _available, size = struct.unpack_from("<qq", data, p)
    p += 16

    words: set[str] = set()
    for _ in range(size):
        slen = struct.unpack_from("<i", data, p)[0]
        p += 4
        words.add(data[p : p + slen].decode("latin1"))
        p += slen + 8  # symbol bytes + int64 key
    return words


def load_vocabulary(model_dir: str) -> set[str]:
    """words.txt if the model ships one, else the graph's symbol table."""
    plain = os.path.join(model_dir, "graph", "words.txt")
    if os.path.isfile(plain):
        with open(plain, encoding="latin1") as fh:
            return {line.split()[0] for line in fh if line.strip()}

    for candidate in ("Gr.fst", "HCLG.fst", "HCLr.fst"):
        path = os.path.join(model_dir, "graph", candidate)
        if os.path.isfile(path):
            return read_symbol_table(path)

    raise SystemExit(f"error: no vocabulary source found under {model_dir}/graph")


def ts_string_array(source: str, name: str) -> list[str]:
    """Pull a `const NAME: string[] = [...]` literal out of a .ts file."""
    match = re.search(r"%s: string\[\] = \[(.*?)\n\]" % re.escape(name), source, re.S)
    if not match:
        return []
    return re.findall(r"'([^']+)'", match.group(1))


def filler_groups() -> dict[str, list[str]]:
    """
    Canonical sound -> its spelling variants, from detector.ts FILLER_CANONICAL.

    Grouping matters for the verdict. A canonical sound is still countable as
    long as ONE of its spellings is in the vocabulary — losing "uhhh" while
    keeping "uh" and "uhh" costs nothing. Only an entire group going missing
    means that sound can never be counted.
    """
    path = os.path.join(REPO_ROOT, "src", "detection", "detector.ts")
    with open(path, encoding="utf-8") as fh:
        source = fh.read()
    block = re.search(r"FILLER_CANONICAL: Record<string, string> = \{(.*?)\n\}", source, re.S)
    if not block:
        raise SystemExit("error: could not find FILLER_CANONICAL in detector.ts")
    groups: dict[str, list[str]] = {}
    for variant, canonical in re.findall(r"([a-z']+)\s*:\s*'([a-z']+)'", block.group(1)):
        groups.setdefault(canonical, []).append(variant)
    return groups


def blocked_words() -> list[str]:
    path = os.path.join(REPO_ROOT, "src", "detection", "profanity.ts")
    with open(path, encoding="utf-8") as fh:
        source = fh.read()
    return ts_string_array(source, "STRONG_BLOCKED_WORDS") + ts_string_array(
        source, "MILD_BLOCKED_WORDS"
    )


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 2

    target = sys.argv[1]
    tmp: tempfile.TemporaryDirectory | None = None
    if target.endswith((".tar.gz", ".tgz")):
        tmp = tempfile.TemporaryDirectory()
        with tarfile.open(target) as tf:
            tf.extractall(tmp.name)
        entries = [
            os.path.join(tmp.name, e)
            for e in os.listdir(tmp.name)
            if os.path.isdir(os.path.join(tmp.name, e)) and not e.startswith("._")
        ]
        if len(entries) != 1:
            raise SystemExit("error: archive should contain exactly one model directory")
        model_dir = entries[0]
    else:
        model_dir = target

    vocab = load_vocabulary(model_dir)
    print(f"    vocabulary: {len(vocab):,} words")

    groups = filler_groups()
    dead_groups = {c: v for c, v in groups.items() if not any(w in vocab for w in v)}
    inert_variants = sorted(
        w for variants in groups.values() for w in variants if w not in vocab
    )
    print(
        f"    filler sounds: {len(groups) - len(dead_groups)}/{len(groups)} "
        "canonical sounds reachable"
    )
    if inert_variants:
        print(
            f"    {len(inert_variants)} spelling variant(s) not in vocabulary "
            "(inert, other spellings still cover the sound):"
        )
        print("      " + " ".join(inert_variants))
    for canonical, variants in dead_groups.items():
        print(f"    UNREACHABLE SOUND '{canonical}': no spelling in vocabulary "
              f"({' '.join(variants)})")

    blocked = blocked_words()
    unreachable = [w for w in blocked if w not in vocab]
    print(
        f"    blocklist: {len(blocked) - len(unreachable)}/{len(blocked)} "
        "words exist in this vocabulary"
    )
    if unreachable:
        print(
            f"    {len(unreachable)} blocked words cannot be emitted by this model "
            "(harmless, just inert)"
        )

    if tmp:
        tmp.cleanup()

    if dead_groups:
        print()
        print(
            "FAIL: %d filler sound(s) have no spelling in this model's vocabulary.\n"
            "      Recognizer B's grammar can only contain in-vocabulary words, so\n"
            "      those sounds could never be counted with this model."
            % len(dead_groups)
        )
        return 1

    print()
    print("OK: every filler sound is reachable in this model's vocabulary.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
