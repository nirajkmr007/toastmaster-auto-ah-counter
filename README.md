# toastmaster-ah-counter

A live, browser-only web app that listens to Toastmasters speakers and counts
their filler words ("um," "uh," "like," "so"…) in real time with animated
per-speaker counters and a streaming transcript.

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
