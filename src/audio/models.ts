/**
 * Speech model catalog.
 *
 * Both recognizers (full transcript + sound-filler grammar) share ONE
 * download. The filler "detection" is not a separate model — recognizer B just
 * restricts this same model's grammar to filler sounds (see voskEngine.ts).
 *
 * ── Why these URLs look the way they do ───────────────────────────────────
 *
 * vosk-browser loads models only as **gzipped tar archives**, but alphacephei
 * publishes them as .zip. So a model can't be linked from alphacephei
 * directly — it has to be repacked and hosted somewhere that sends CORS
 * headers. See scripts/repack-en-in-model.sh.
 *
 * ── Accuracy, stated honestly ─────────────────────────────────────────────
 *
 * Published word error rates (alphacephei.com/vosk/models) are measured on
 * different test sets, so they are NOT directly comparable:
 *   en-US small 0.15 -> 9.85 (librispeech test-clean), 10.38 (tedlium)
 *   en-IN small 0.4  -> 49.05 (NPTEL Pure)
 * The Indian-English model is trained on Indian-accented speech, so it should
 * transcribe Indian speakers better in practice — but that 49% is high in
 * absolute terms and nobody has benchmarked the two head-to-head on the same
 * audio. Treat the toggle as "try both, keep what works", not as an upgrade.
 */

export interface ModelOption {
  id: string
  /** Short label for the toggle. */
  label: string
  /** One line shown under the toggle. */
  note: string
  url: string
  approxSizeMb: number
}

/**
 * Indian-English bundle. Empty until the repacked tar.gz is uploaded as a
 * Release asset — see scripts/repack-en-in-model.sh, which prints the exact
 * URL to paste here. An empty URL keeps the option visible but disabled,
 * rather than shipping a toggle that 404s.
 */
const EN_IN_MODEL_URL = ''

export const MODELS: ModelOption[] = [
  {
    id: 'en-us',
    label: 'US English',
    note: 'Default. Best general accuracy on the published benchmarks.',
    url: 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz',
    approxSizeMb: 40,
  },
  {
    id: 'en-in',
    label: 'Indian English',
    note: 'Trained on Indian-accented speech. Separate one-time download.',
    url: EN_IN_MODEL_URL,
    approxSizeMb: 36,
  },
]

export const DEFAULT_MODEL_ID = 'en-us'

export function getModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]
}

/** A model with no URL configured yet can't be selected. */
export function isModelAvailable(m: ModelOption): boolean {
  return m.url.length > 0
}

/** Kept for callers that only ever want the default. */
export const MODEL_URL = MODELS[0].url
