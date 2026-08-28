# toastmaster-auto-ah-counter

A live, browser-only web app that listens to Toastmasters speakers and counts
their filler words ("um," "uh," "like," "so"…) in real time with animated
per-speaker counters and a streaming transcript.

**Live app:** https://nirajkmr007.github.io/toastmaster-auto-ah-counter/

Chrome or Edge, allow microphone access when prompted. First load fetches the
~40 MB Vosk model — subsequent starts are instant.

## Design at a glance

- **Client-only.** No backend. One tab does audio capture, STT, and filler
  detection locally. Session state lives in memory and dies when the tab
  closes — nothing is stored or uploaded.
- **One mic, a roster of speakers.** The operator (the ah-counter) runs a
  single tab and taps who's speaking now as the meeting moves. Each speaker
  accumulates their own counts, transcript, and speaking time; the end-of-
  session report has a section per speaker. (A multi-device sync mode is
  parked — see roadmap.)
- **Two recognizers, one model.** A single Vosk model drives two recognizers
  fed the same audio: **A** (full grammar) produces the transcript and the
  crutch words (`so`, `like`, `actually`); **B** (grammar restricted to filler
  sounds + `[unk]`) is a dedicated sound-filler detector for `um/uh/er/ah/hmm`.
  This sidesteps the recall-vs-precision tuning of a single model — A keeps
  English quality, B specializes in the hesitations A smooths over. No offline
  model tuning.
- **Filler detection.** Sound fillers come straight from recognizer B
  (canonicalized to one label). Crutch words come from text rules on A's
  transcript: context rules (`so` at utterance start, `like` unless a
  verb/simile/infinitive) + a rolling frequency threshold, with per-word
  sensitivity (Extra strict / Strict / Balanced / Loose). The operator can add
  or correct any count manually.
- **UI.** Two boxes. Left: crutch-word bubbles + the streaming transcript.
  Right: sound-filler bubbles. Each bubble has −/+/× to fix miscounts. A
  per-speaker speech timer shows a green/yellow/red signal.
- **Noise cancellation.** Browser-native `noiseSuppression` + `echoCancellation`
  via `getUserMedia`.

## Stack

- Vite + React 19 + TypeScript
- Zustand — local state (speaker roster + session)
- Framer Motion — bubble / report animations
- vosk-browser — streaming STT (two recognizers off one model)
- html-to-image — PNG export of the session report

## How your voice becomes a counted filler

The path from a spoken "um" to a bubble on screen, and who owns each step:

```mermaid
flowchart LR
  MIC["Capture<br/><small>mic to 16 kHz PCM</small>"] --> A["Recognizer A<br/><small>full grammar</small>"]
  MIC --> B["Recognizer B<br/><small>fillers + [unk]</small>"]
  A --> T["Transcript"]
  T --> CR["Crutch words<br/><small>so, like (text rules)</small>"]
  B --> SF["Sound fillers<br/><small>um, uh, er, ah</small>"]

  subgraph vosk [one Vosk model, two recognizers]
    A
    B
  end
```

The same audio is fed to both recognizers. A is a normal transcriber; B has
its grammar restricted to filler sounds, so it is forced to output a filler or
`[unk]` — catching the `um`/`uh` that A tends to smooth into real words. Sound
fillers come only from B; crutch words come only from A's transcript. No
offline model tuning is involved.

## Getting started

Requires Node.js 20+ and a Chromium browser (mic access). Then:

```bash
npm install
npm run dev        # http://localhost:5173
```

`./setup.sh` is an optional helper that installs Node via Homebrew/apt if you
don't already have it, then runs `npm install`.

Useful scripts: `npm run build` (type-check + production build), `npm run
preview` (serve the build), `npm run lint` (oxlint).

## Speech recognition (two recognizers)

One model is downloaded per session (default: the ~40 MB
`vosk-model-small-en-us-0.15`), fetched on first load and browser-cached. It
powers two recognizers created from `src/audio/voskEngine.ts`:

- **Recognizer A** — full grammar. Produces the live transcript; the crutch
  words (`so`, `like`, `actually`, `you know`) are found by text rules in
  `src/detection/detector.ts`.
- **Recognizer B** — grammar restricted at runtime to the filler sounds plus
  `[unk]` (Vosk's `KaldiRecognizer(rate, grammar)`). It can only emit a filler
  sound or `[unk]`, so it reliably catches the `um`/`uh`/`er`/`ah` that the
  full model tends to turn into real words.

Both are fed the same audio. This is why there's no offline model tuning and no
recall/precision knob to fight: A handles English, B specializes in sounds. The
filler-sound list (recognizer B's grammar) and the crutch words are both edited
in the ⚙ **Manage filler words** panel.

### Backup & restore (portable settings file)

Nothing is stored server-side, so settings live in one browser's localStorage —
which means clearing the browser or moving to another laptop loses a carefully
tuned filler list. ⚙ → **Backup & restore** exports a JSON file the user owns,
and imports it back.

The file carries **configuration only**: filler lists, preset name, sensitivity,
speech length, auto-stop, masked words, model choice, theme. Never speech,
transcripts, counts or speaker names — asserted by a test, not just by intent.

`src/settingsFile.ts` treats an imported file as untrusted input, because it is:
hand-edited, truncated, from a newer version, or simply the wrong JSON file. It
checks types, clamps ranges, caps word and list lengths, normalises case,
de-duplicates, migrates legacy values, ignores unknown keys, and falls back to
the current value per field rather than rejecting the whole file. Partial files
are valid and apply only the keys they contain.

### Accent model (US / Indian English)

⚙ → **Accent model** switches between US English and Indian English. Switching
disposes the loaded model (terminating its Web Worker, which holds ~300 MB at
runtime) and downloads the other one; it's disabled while listening.

**The Indian-English model is committed to this repo**, at
`public/models/vosk-model-small-en-in-0.4.tar.gz` (37.6 MB), and served by Pages
alongside the app. That is deliberate, and the reason is CORS:

- vosk-browser loads models only as *gzipped tar archives*, but alphacephei
  publishes `.zip` — so the file has to be repacked either way
  (`./scripts/repack-en-in-model.sh`).
- A **GitHub Release asset does not work.** `releases/download/...` answers with
  a 302 to a signed `objects.githubusercontent.com` URL, and that redirect
  response carries no `Access-Control-Allow-Origin`, so the browser blocks the
  fetch before following it. Release assets are fine for `curl` and
  `<a download>`, not for cross-origin `fetch`.
- Serving it from Pages makes the request **same-origin**, where CORS does not
  apply at all. No third-party host to trust or verify.

The cost is a 37.6 MB blob in git history, accepted knowingly. `.gitignore`
ignores `public/models/*.tar.gz` with an explicit exception for this one file.

To disable the option instead, set `EN_IN_MODEL_URL` in `src/audio/models.ts` to
`''` — the toggle then renders visibly disabled rather than failing on click.

**On accuracy, honestly:** the published WERs are measured on *different test
sets* and are not comparable — en-US small scores 9.85 (librispeech test-clean)
while en-IN small scores 49.05 (NPTEL Pure). The Indian-English model is trained
on Indian-accented speech and should transcribe Indian speakers better in
practice, but no one has benchmarked the two head-to-head on the same audio.
Treat the toggle as "try both, keep what works".

#### Verifying a model before shipping it

`scripts/verify-model-vocab.py` parses a model's vocabulary — from `words.txt`
if present, otherwise straight out of the OpenFst symbol table in
`graph/Gr.fst`, since small Vosk models ship no plain word list — and checks the
two things that silently break when a model changes:

1. **Every filler sound is reachable.** A Kaldi grammar can only contain
   in-vocabulary words, so a filler the model has no symbol for can never be
   counted by recognizer B — with no error, just silence. The check passes if at
   least one spelling of each canonical sound is present.
2. **The profanity blocklist still lines up.** The shipped list was intersected
   against the en-US vocabulary; a different model means different coverage.

```bash
./scripts/verify-model-vocab.py path/to/model.tar.gz
```

Results for both shipped models:

| | en-US 0.15 | en-IN 0.4 |
|---|---|---|
| Vocabulary | 152,217 words | 72,551 words |
| Canonical filler sounds reachable | 8/8 | 8/8 |
| Inert spelling variants | `uhhh` | `ahhh ehh erm mmm uhhh ummm` |
| Blocklist words present | 206/209 | 147/209 |

Inert variants are harmless — each canonical sound still has at least one
spelling the model can emit, and a blocked word the model can't say needs no
masking. The en-IN vocabulary being less than half the size of en-US is worth
noting though: fewer words means more speech decoded into whatever *is* in
vocabulary, which is consistent with its higher published WER.

### Clean transcript (profanity masking)

Because recognizer A runs the model's full open vocabulary, a nonverbal burst —
a throat clear, a plosive into the mic, a long `ahh` — occasionally decodes as a
short profane word that nobody said. This tool gets used in corporate meetings
and on shared screens, so `src/detection/profanity.ts` masks a configurable list
of words to `***`.

The mask is applied **at ingestion**, before the text reaches the store, so
nothing profane ever lands in the transcript pane, the report, the exported PNG
or the copied session log. It's token-preserving (one word → one `***`), which
keeps crutch-word highlight positions aligned, and it matches whole tokens only
— `class`, `assume` and `passage` are never touched. Filler counting is
unaffected: sound fillers come from recognizer B, whose grammar can't produce
profanity in the first place.

The list has two tiers:

- **Strong (186 words, always on)** — profanity, explicit sexual/anatomical
  terms, and racial/ethnic/homophobic/ableist slurs.
- **Mild (18 words, on by default, one checkbox to disable)** — crude but
  ordinary in speech: `damn`, `hell`, `crap`.

Every entry was intersected against the recognizer's **actual vocabulary** — the
152,217-word symbol table inside `graph/Gr.fst` of the shipped model — so the
list contains no words the model is incapable of emitting, and nothing that
could fire is missing for lack of an inflection. If the model is ever swapped,
re-run that intersection.

Words are deliberately **excluded** where masking would damage honest speech:
ordinary technical vocabulary (`git`, `knob`, `screw`, `stripper`, `slag`,
`cracker`), common names (`dick`, `willy`, `fanny`, `coon`), reclaimed identity
terms (`queer`), clinical terms (`spastic`), and plain insults that aren't
embarrassing to display (`stupid`, `idiot`). The full rationale, including the
trade-offs knowingly accepted, is in the header of `profanity.ts`.

The built-in list is deliberately **not rendered in the UI** — printing 200
profanities and slurs into a settings panel that gets opened on a shared screen
defeats the point. Under ⚙ → **Clean transcript** users see only the words they
added themselves; changing the built-ins means editing the source.

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
- The Vosk model (~40 MB) is fetched from `ccoreilly.github.io` on first Start.
  If that origin ever goes down, self-host it: drop the `.tar.gz` under
  `public/models/` and point `MODEL_URL` in `src/audio/models.ts` at
  `${import.meta.env.BASE_URL}models/...`.

## Roadmap

**Built**
- Two recognizers off one Vosk model: full transcript (A) + restricted
  sound-filler grammar (B). No offline model tuning.
- One-mic multi-speaker sessions: add a roster, tap the active speaker, per-
  speaker counts / transcript / speaking time.
- Sound fillers from recognizer B; crutch words from rule-based text detection
  on A (context + frequency rules, sensitivity levels).
- Configurable word lists (⚙ Manage filler words), manual add + −/+/× fixes.
- Per-speaker speech timer with green/yellow/red signal.
- Two-box UI: crutch words + transcript | sound fillers. Consolidated
  end-of-session report with PNG export.

**Parked**
- Multi-device mode: each speaker on their own device, synced via Yjs/WebRTC
  (would need a signaling server — trades away the zero-backend property).
- RNNoise-WASM for stronger noise cancellation.
- LLM-based crutch classifier for higher crutch-word precision.

**Removed in v2 (recoverable from the `v1.0.0` tag)**
- CrisperWhisper / transformers.js engine.
- Offline LM-adaptation toolchain (`scripts/lm-adapt/`) and extra Vosk models
  (lgraph, Indian English). The dual-recognizer design made them unnecessary.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, scripts, project structure,
and the mental model of the two-recognizer design. Short version: Node 20+,
`npm install`, `npm run dev`; keep it backend-free and session-only.

## License

[MIT](LICENSE).
