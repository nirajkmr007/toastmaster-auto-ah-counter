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
 * Indian-English bundle: served from THIS origin, out of public/models/.
 *
 * It has to be same-origin. A GitHub Release asset was tried first and fails:
 * `github.com/<owner>/<repo>/releases/download/...` answers with a 302 to a
 * signed objects.githubusercontent.com URL, and that redirect response carries
 * no Access-Control-Allow-Origin header, so the browser blocks the fetch before
 * it ever follows the redirect. Release assets work for curl and for
 * `<a download>`; they do not work for cross-origin fetch. Serving the file
 * from Pages alongside the app removes the question entirely — same-origin
 * requests are not subject to CORS.
 *
 * Built as an absolute URL because vosk-browser fetches inside a Web Worker
 * that may be created from a blob:, where a root-relative path would not
 * resolve against the page. BASE_URL keeps it correct under the Pages subpath
 * ('/toastmaster-auto-ah-counter/') and in dev ('/').
 *
 * Set this to '' to disable the option — the toggle then renders visibly
 * disabled instead of shipping a button that fails.
 */
const EN_IN_MODEL_PATH = 'models/vosk-model-small-en-in-0.4.tar.gz'

const EN_IN_MODEL_URL = (() => {
  // Guarded so this module can be imported outside a browser (tests, tooling)
  // without throwing on import.meta.env or window.
  try {
    const base = import.meta.env?.BASE_URL ?? '/'
    if (typeof window === 'undefined') return `${base}${EN_IN_MODEL_PATH}`
    return new URL(`${base}${EN_IN_MODEL_PATH}`, window.location.href).href
  } catch {
    return `/${EN_IN_MODEL_PATH}`
  }
})()

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
    approxSizeMb: 37,
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
