# Contributing

Thanks for your interest! This is a small, browser-only React + TypeScript app.
No backend, no accounts — everything runs client-side.

## Prerequisites

- Node.js 20 or newer (`node --version`)
- A modern browser with microphone access (Chrome or Edge recommended)

## Setup

```bash
git clone https://github.com/nirajkmr007/toastmaster-auto-ah-counter.git
cd toastmaster-auto-ah-counter
npm install
npm run dev        # http://localhost:5173
```

`./setup.sh` is an optional convenience that installs Node (via Homebrew/apt)
if you don't have it, then runs `npm install`.

## Scripts

| Command         | What it does                                  |
| --------------- | --------------------------------------------- |
| `npm run dev`     | Start the Vite dev server with HMR          |
| `npm run build`   | Type-check (`tsc -b`) then build to `dist/` |
| `npm run preview` | Serve the production build locally          |
| `npm run lint`    | Lint with oxlint                            |

Before opening a PR, please make sure `npm run build` passes (it runs the
type-checker) and `npm run lint` is clean.

## Project structure

```
src/
  App.tsx                 wiring: engine + detector + layout
  store.ts                Zustand store — speaker roster, counts, session
  analytics.ts            pure report/stat derivations
  audio/
    voskEngine.ts         the two Vosk recognizers (A: transcript, B: sounds)
    models.ts             MODEL_URL (the single Vosk model)
  detection/
    detector.ts           crutch-word rules + filler canonicalization
    presets.ts            default word lists
  components/             Roster, Controls, FillerPane, ManualAdd,
                          TranscriptPane, Timer, SessionReport, SettingsPanel
.github/workflows/deploy.yml   builds + deploys to GitHub Pages on push to main
```

See the "Speech recognition (two recognizers)" section of the
[README](README.md) for how the dual-recognizer design works — it's the core
idea to understand before changing audio or detection code.

## How it fits together (quick mental model)

1. One Vosk model powers **two recognizers** fed the same mic audio.
2. Recognizer **A** produces the transcript; text rules in `detector.ts` pull
   out crutch words (`so`, `like`).
3. Recognizer **B** has its grammar restricted to filler sounds + `[unk]`, so
   it emits `um`/`uh`/`er`/`ah` directly.
4. Both feed the per-speaker store; the UI renders two boxes + a transcript.

## Conventions

- TypeScript, no `any` in app code (the Vosk bindings are the one exception).
- Keep it backend-free and session-only — no telemetry, no storage of audio or
  transcripts. Only user *config* (word lists, preferences) is persisted, and
  only to `localStorage`.
- Small, focused PRs with a clear description are easiest to review.

## Reporting bugs / ideas

Open an issue describing what you expected vs. what happened, your browser, and
steps to reproduce. Feature ideas are welcome too.
