# toastmaster-auto-ah-counter

A live, browser-only web app that listens to Toastmasters speakers and counts
their filler words ("um," "uh," "like," "so"…) in real time with animated
per-speaker counters and a streaming transcript.

**Live app:** https://nirajkmr007.github.io/toastmaster-auto-ah-counter/

Chrome or Edge, allow microphone access when prompted. First load fetches the
~40 MB Vosk model — subsequent starts are instant.

## Design at a glance

- **Client-only.** No backend. Every tab does its own audio capture, STT, and
  filler detection. Session state lives in memory and dies when the last tab
  closes.
- **One tab per speaker.** Each participant opens the app on their own device
  and joins a shared room by code. Tabs sync speaker list and counters via a
  Yjs CRDT over WebRTC.
- **STT: Vosk-Browser in a Web Worker.** ~200 ms streaming, keeps disfluencies
  (Whisper drops them, which is why it's not used here).
- **Filler detection.** Configurable word lists (sound fillers + crutch
  phrases) with a rule layer for context-sensitive words (`so` at sentence
  start, `like` unless followed by `to`/`a`/a number, frequency thresholds).
  Per-word sensitivity: Strict / Balanced / Loose.
- **UI.** Left pane: animated filler bubbles per speaker with counters.
  Right pane: streaming transcript.
- **Noise cancellation.** Browser-native `noiseSuppression` + `echoCancellation`
  via `getUserMedia`. RNNoise-WASM only if we hear complaints.

## Stack

- Vite + React 19 + TypeScript
- Zustand — local state
- Framer Motion — bubble animations
- Yjs + y-webrtc — multi-tab session sync (no backend)
- vosk-browser — streaming STT with disfluencies preserved

## Getting started

First-time setup (installs Node 22 via Homebrew/apt if missing, then `npm install`):

```bash
./setup.sh
```

Then:

```bash
npm run dev
```

## Choosing a model

The **Model** dropdown in the header selects which STT model to use:

| ID                  | Engine           | Size    | Notes                                                        |
| ------------------- | ---------------- | ------- | ------------------------------------------------------------ |
| `vosk-small-en-us`  | Vosk (streaming) | ~40 MB  | Default. Fast, word-by-word, works everywhere. CDN-hosted.   |
| `vosk-en-us-lgraph` | Vosk (streaming) | ~128 MB | More accurate English, still word-by-word. Self-hosted.      |
| `vosk-small-en-in`  | Vosk (streaming) | ~36 MB  | Indian English. Word-by-word. Self-hosted.                   |
| `crisperwhisper`    | transformers.js  | ~500 MB | Best filler accuracy, but ~6 s batches, not live. Heavy.     |

Everything runs locally — models are fetched once (browser-cached) and audio
never leaves the tab.

### Why not the 1–2 GB Vosk models?

alphacephei publishes flagship models like `vosk-model-en-us-0.22` (1.8 GB)
and `vosk-model-en-in-0.5` (1 GB, Indian English). **They can't run in a
browser** — vosk-browser executes Vosk in WebAssembly, which is limited to
roughly 2 GB of memory, and these models need several GB at runtime. Loading
one crashes the tab. `en-us-0.22-lgraph` (128 MB) is a compressed-graph build
of the flagship model and is the largest that reliably runs client-side —
that's why it's the "bigger English" option here. Running the full-size
models would require the server-side architecture we deliberately avoided.

### Self-hosted models (lgraph + Indian English)

The two Vosk upgrades are self-hosted because vosk-browser needs `.tar.gz`
while alphacephei ships `.zip`. A script handles the conversion:

```bash
./scripts/fetch-models.sh
```

It downloads each `.zip`, repacks it to `.tar.gz`, and drops it in
`public/models/`. `setup.sh` runs it for you on first setup, and the GitHub
Pages workflow runs it at deploy time — so the models ship in the deployed
site without bloating the git repo (the tarballs are git-ignored). Requires
`curl`, `unzip`, and `tar` on PATH.

**CrisperWhisper caveats (it's the accurate-but-heavy option):**

- Whisper isn't a streaming model, so this engine transcribes in ~6-second
  segments — you'll see the transcript and counters update every few seconds,
  not word-by-word like Vosk.
- Large first-load download (~500 MB, cached afterward). Use a good connection
  the first time.
- Needs a modern browser. It prefers **WebGPU** and falls back to CPU/WASM
  (much slower). On GitHub Pages the multi-threaded WASM path is limited
  because Pages can't send the COOP/COEP headers `SharedArrayBuffer` requires
  — WebGPU sidesteps that, so a WebGPU-capable browser (recent Chrome/Edge)
  is strongly recommended.
- Best used with a **time limit** set, so the model isn't grinding on an
  open-ended session.

Keep Vosk as the default for live meetings; reach for CrisperWhisper when you
want the most accurate filler count and can wait for the download.

## Adding a new model

The catalog is [`src/audio/models.ts`](src/audio/models.ts). vosk-browser
requires a **`.tar.gz`** (not `.zip`) whose root contains the standard Vosk
Kaldi model directory. Two ways to add one:

### 1. Self-host (recommended, most reliable)

1. Download the `.zip` for the model you want from
   [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models)
   (e.g. `vosk-model-small-en-in-0.4.zip`).
2. Repack as tar.gz — the tarball's root should be the model directory:
   ```bash
   unzip vosk-model-small-en-in-0.4.zip
   tar czf vosk-model-small-en-in-0.4.tar.gz vosk-model-small-en-in-0.4
   ```
3. Drop the `.tar.gz` into `public/models/` (create the folder if needed).
4. Uncomment (or add) the matching entry in `MODELS`:
   ```ts
   {
     id: 'vosk-small-en-in',
     name: 'Vosk small (en-IN)',
     language: 'en-IN',
     approxSizeMB: 40,
     description: 'Tuned for Indian English pronunciation.',
     url: `${import.meta.env.BASE_URL}models/vosk-model-small-en-in-0.4.tar.gz`,
     engineType: 'vosk',
   }
   ```

Files under `public/` are copied verbatim into `dist/` at build time and
served alongside the app. Note that models this size push you against the
GitHub Pages 1 GB repo limit if you add many.

### 2. External URL

If you already have a `.tar.gz` served with CORS enabled somewhere (your own
CDN, a HuggingFace repo that hosts tarballs, etc.), just point `url:` at it.
The app will fetch on first Start.

## Adding a new STT engine (pluggable architecture)

The Vosk-specific code is isolated behind the
[`SttEngine`](src/audio/sttEngine.ts) interface. To plug in a different
recognizer (e.g., the browser-native Web Speech API, whisper.cpp-WASM,
CrisperWhisper — anything that keeps disfluencies), do four things:

1. **Implement `SttEngine`** in a new file under `src/audio/`, matching the
   `loadModel` / `start` / `stop` / `isModelLoaded` contract.
2. **Add your engine type** to `EngineType` in `src/audio/models.ts`
   (e.g. `'vosk' | 'web-speech'`).
3. **Wire the factory** in `src/audio/sttEngine.ts` — add a new branch to
   `createEngine` that returns your factory.
4. **List your model(s)** in the `MODELS` catalog with the new `engineType`.

No change is needed anywhere else — the store, UI, timer, detection rules,
session report, and PNG export all keep working, because they only touch the
`SttEngine` interface.

**Worked example — the CrisperWhisper engine.** The second engine that ships
today is a concrete template for the steps above:
[`src/audio/whisperEngine.ts`](src/audio/whisperEngine.ts) implements
`SttEngine` on top of transformers.js, with heavy inference pushed into
[`src/audio/whisperWorker.ts`](src/audio/whisperWorker.ts) (a Web Worker) so
the UI stays responsive. Because Whisper isn't streaming, the engine buffers
mic audio and flushes *non-overlapping* ~6 s segments to the worker — the
non-overlap is deliberate, so a filler caught near a boundary isn't counted
twice. Copy this file as a starting point for any chunk-based engine.

## Deploy (GitHub Pages)

The app is a fully static bundle, so any static host works. This repo ships a
GH Pages workflow (`.github/workflows/deploy.yml`) that builds and publishes
on every push to `main`. One-time setup:

1. Push the repo to GitHub as **public** at
   `github.com/<you>/toastmaster-auto-ah-counter`.
2. **Settings → Pages → Source: GitHub Actions** (not "Deploy from a branch").
3. Push to `main`. The workflow builds, uploads `dist/`, and deploys to
   `https://<you>.github.io/toastmaster-auto-ah-counter/`.

Notes:

- The subpath is hard-coded in `vite.config.ts` (`base: '/toastmaster-auto-ah-counter/'`
  for `build`; dev stays at `/`). If you rename the repo, update it there.
- HTTPS is automatic — required, because `getUserMedia` won't work over HTTP.
- The Vosk model (~40 MB) is still fetched from `ccoreilly.github.io` on first
  Start. If that origin ever goes down, drop the `.tar.gz` into
  `public/models/` and set `VITE_VOSK_MODEL_URL` in `.env`.

## Roadmap

**v1 scope**
- Room code join, per-speaker name entry
- Vosk streaming STT + filler detection module with position/frequency rules
- Configurable word lists (Toastmasters Classic, Corporate Speak presets)
- Sensitivity toggle per crutch word
- Animated per-speaker counter bubbles + streaming transcript

**Riskiest assumption to validate first:** that the position/context rules for
crutch words hit ≥70 % precision on real speech under "Balanced." Prototype
the detection module in isolation (mic → Vosk → rules → console.log)
before investing in UI polish. Tracked in Linear.

**Parked**
- Distil-Whisper second pass for prettier transcripts
- RNNoise-WASM
- Self-hosted WebRTC signaling
- LLM-based crutch classifier
- Post-session speech metrics / export
