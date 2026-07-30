# Vosk LM adaptation — boost filler-word recognition

This rebuilds the **language model** of the small Vosk model so the decoder is
more likely to output `um`/`uh`/`er`/`ah` instead of "correcting" them into
real words. It does **not** retrain the acoustic model, and it can't add words
the model's dictionary doesn't already have (the fillers are already there).

Mirrors the official procedure: <https://alphacephei.com/vosk/adaptation>

> Honest expectations: this raises filler **recall** but can lower precision
> (the model may emit fillers it didn't hear) and biases the vocabulary toward
> the corpus style. It's reversible — the original grammar is backed up as
> `Gr.fst.orig`. If the win isn't worth it, revert.

## What you need

Five command-line tools: `fstsymbols`, `farcompilestrings`, `fstconvert`
(OpenFST) and `ngramcount`, `ngrammake` (OpenGRM). The rebuild script picks
them up from anywhere on your PATH.

### Easiest: conda-forge (recommended on macOS — no compiling)

Homebrew has `openfst` but **not** OpenGRM, and Kaldi's bundled OpenGRM (1.3.7)
often won't compile against a modern OpenFST. conda-forge ships both, prebuilt
and version-matched:

```bash
# If you don't have conda/mamba, install miniforge first:
brew install miniforge && conda init zsh   # then restart your shell

conda create -n vosklm -c conda-forge ngram openfst -y
conda activate vosklm

# confirm all five tools resolve:
for b in fstsymbols farcompilestrings fstconvert ngramcount ngrammake; do
  command -v "$b" || echo "MISSING $b"
done
```

With this you do **not** need Kaldi at all — skip to "Steps" below and run the
rebuild script without `KALDI_ROOT`.

### Alternative: Kaldi tools build

Only if you can't use conda. This is a C++ build; **you only need
`kaldi/tools`** (not `kaldi/src`, so ignore the MKL/BLAS and Python warnings).
Note that Kaldi's `install_opengrm.sh` pulls OpenGRM 1.3.7, which may fail to
compile against OpenFST 1.8.4 — if it does, use the conda path above.

### macOS (Homebrew)

```bash
# 1. Prerequisites. gfortran comes from the gcc formula.
brew install automake autoconf libtool wget sox gcc

git clone https://github.com/kaldi-asr/kaldi
cd kaldi/tools

# 2. Build the tools. macOS has no `nproc`; use sysctl (or just -j4).
make -j"$(sysctl -n hw.ncpu)"

# If it complains about a python symlink, create the opt-out and retry make:
#   mkdir -p python && touch python/.use_default_python && make -j4

# 3. OpenGRM (ngramcount / ngrammake)
extras/install_opengrm.sh

# 4. Point KALDI_ROOT at the checkout
export KALDI_ROOT="$(pwd)/.."
```

If `extras/install_opengrm.sh` fails with `fst/fst.h header not found`, its
configure didn't get pointed at the OpenFST you just built. Build OpenGRM
manually (still in `kaldi/tools`):

```bash
OPENFST="$PWD/openfst"
ls "$OPENFST/include/fst/fst.h"          # sanity: header must exist
OGDIR="$(ls -d opengrm-ngram-*/ | head -1)"   # the extracted source dir
cd "$OGDIR"
./configure --prefix="$PWD" \
  CPPFLAGS="-I$OPENFST/include" \
  CXXFLAGS="-std=c++17" \
  LDFLAGS="-L$OPENFST/lib -Wl,-rpath,$OPENFST/lib"
make -j"$(sysctl -n hw.ncpu)" && make install
cd .. && ln -sfn "$OGDIR" opengrm       # so binaries sit at tools/opengrm/bin
ls opengrm/bin/ngramcount opengrm/bin/ngrammake
```

If `gfortran` still isn't found after `brew install gcc`, Homebrew may have
installed it versioned (e.g. `gfortran-14`); symlink it onto PATH, e.g.
`ln -s "$(brew --prefix)/bin/gfortran-14" "$(brew --prefix)/bin/gfortran"`.

### Linux (Debian/Ubuntu)

```bash
sudo apt-get install -y automake autoconf libtool wget sox gfortran g++ make zlib1g-dev
git clone https://github.com/kaldi-asr/kaldi
cd kaldi/tools
make -j"$(nproc)"
extras/install_opengrm.sh
export KALDI_ROOT="$(pwd)/.."
```

### Easiest: Docker (skips the native build fight)

If the native build keeps fighting (common on Apple Silicon), run everything in
a Linux container with the repo mounted:

```bash
docker run -it --rm -v "$PWD":/work -w /work debian:12 bash
# then, inside the container:
apt-get update && apt-get install -y git make g++ automake autoconf libtool \
  wget sox gfortran zlib1g-dev curl nodejs
git clone https://github.com/kaldi-asr/kaldi
cd kaldi/tools && make -j"$(nproc)" && extras/install_opengrm.sh
export KALDI_ROOT=/work/kaldi
cd /work
# ...then run the corpus + rebuild steps below; public/models/ is on your host.
```

## Steps (run locally)

From the repo root:

```bash
# 1. Generate a filler-heavy training corpus (lowercased, no punctuation).
node scripts/lm-adapt/generate-corpus.mjs text.txt 6000 3

# 2. Get an EXTRACTED copy of the small model to edit.
#    (fetch-models.sh downloads tar.gz's; for the default model grab it once:)
curl -fSL https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz \
  -o /tmp/base.tar.gz
mkdir -p /tmp/vosk-adapt && tar xzf /tmp/base.tar.gz -C /tmp/vosk-adapt
#    -> model dir: /tmp/vosk-adapt/vosk-model-small-en-us-0.15

# 3. Rebuild the language model in place (backs up Gr.fst -> Gr.fst.orig).
KALDI_ROOT=/path/to/kaldi \
  ./scripts/lm-adapt/rebuild-lm.sh \
  /tmp/vosk-adapt/vosk-model-small-en-us-0.15 \
  text.txt

# 4. Repack as a tar.gz whose ROOT is the model directory, with a new name,
#    into the app's models folder.
mkdir -p public/models
( cd /tmp/vosk-adapt \
  && tar czf vosk-model-small-en-us-0.15-fillers.tar.gz vosk-model-small-en-us-0.15 )
mv /tmp/vosk-adapt/vosk-model-small-en-us-0.15-fillers.tar.gz public/models/
```

## Wire it into the app

In [`src/audio/models.ts`](../../src/audio/models.ts) there's a commented
`vosk-small-en-us-fillers` entry — uncomment it. It points at
`${import.meta.env.BASE_URL}models/vosk-model-small-en-us-0.15-fillers.tar.gz`,
so once the tarball is in `public/models/` it appears in the Model dropdown.

```bash
npm run dev   # pick "Vosk small (en-US, filler-tuned)" and compare
```

## Deploying it (note)

`public/models/*.tar.gz` is git-ignored, and the CI `fetch-models.sh` only
downloads the standard models — so the adapted model **won't ship via CI by
default**. To deploy it, either:

- commit this one tarball (force-add: `git add -f public/models/vosk-model-small-en-us-0.15-fillers.tar.gz`) — adds ~40 MB to the repo, or
- host it somewhere with CORS and point the catalog `url` at that instead.

## Reverting

```bash
mv /tmp/vosk-adapt/vosk-model-small-en-us-0.15/graph/Gr.fst.orig \
   /tmp/vosk-adapt/vosk-model-small-en-us-0.15/graph/Gr.fst
```

(The script prints the exact path of `Gr.fst.orig` when it runs.)
