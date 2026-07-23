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

The app ships with three built-in Vosk models — pick from the **Model**
dropdown in the header. Larger models are more accurate but slower to
download on first use.

| ID                     | Language | Size    | Notes                                            |
| ---------------------- | -------- | ------- | ------------------------------------------------ |
| `vosk-small-en-us`     | en-US    | ~40 MB  | Default. Fast, decent accuracy.                  |
| `vosk-small-en-in`     | en-IN    | ~40 MB  | Tuned for Indian English pronunciation.          |
| `vosk-en-us-lgraph`    | en-US    | ~130 MB | More accurate. Bigger first-load download.       |

Models are downloaded once per browser (HTTP-cached) and stream audio through
a Web Worker locally — nothing leaves the tab.

## Adding a new model

The catalog lives in [`src/audio/models.ts`](src/audio/models.ts). To add a
new Vosk model, append an entry:

```ts
{
  id: 'vosk-small-fr',
  name: 'Vosk small (fr)',
  language: 'fr',
  approxSizeMB: 40,
  description: 'French, small footprint.',
  url: 'https://example.com/path/to/vosk-model-small-fr-0.22.tar.gz',
  engineType: 'vosk',
}
```

The model must be a `.tar.gz` in vosk-browser's expected format (Kaldi
model directory tar-gzipped at the root). See
[alphacephei.com/vosk/models](https://alphacephei.com/vosk/models) for
the canonical model listing.

**Self-hosting a model.** If you'd rather not depend on a third-party
mirror (or need offline use), drop the tarball into `public/models/`,
then point the URL at the deployed asset path:

```ts
url: `${import.meta.env.BASE_URL}models/vosk-model-small-en-us-0.15.tar.gz`
```

Files under `public/` are copied verbatim into `dist/` at build time.

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
