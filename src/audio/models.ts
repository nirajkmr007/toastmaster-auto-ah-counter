/**
 * Model catalog — the source of truth for which STT models the app offers.
 *
 * Add a model by appending an entry below. See README ("Adding a new model")
 * for guidance and self-hosting notes.
 *
 * All currently-listed URLs point at ccoreilly's vosk-browser gh-pages mirror.
 * If any specific tarball ever 404s, replace the `url` with a self-hosted
 * copy under `public/models/` (see README) or use a HuggingFace mirror.
 */

export type EngineType = 'vosk'

export interface ModelInfo {
  id: string
  name: string
  language: string
  approxSizeMB: number
  description: string
  url: string
  engineType: EngineType
}

const CCOREILLY = 'https://ccoreilly.github.io/vosk-browser/models'

export const MODELS: ModelInfo[] = [
  {
    id: 'vosk-small-en-us',
    name: 'Vosk small (en-US)',
    language: 'en-US',
    approxSizeMB: 40,
    description:
      'Fast download, decent accuracy for American English. Default.',
    url: `${CCOREILLY}/vosk-model-small-en-us-0.15.tar.gz`,
    engineType: 'vosk',
  },
  {
    id: 'vosk-small-en-in',
    name: 'Vosk small (en-IN)',
    language: 'en-IN',
    approxSizeMB: 40,
    description: 'Tuned for Indian English pronunciation.',
    url: `${CCOREILLY}/vosk-model-small-en-in-0.4.tar.gz`,
    engineType: 'vosk',
  },
  {
    id: 'vosk-en-us-lgraph',
    name: 'Vosk large (en-US, lgraph)',
    language: 'en-US',
    approxSizeMB: 130,
    description:
      'More accurate than the small model. Larger first-load download.',
    url: `${CCOREILLY}/vosk-model-en-us-0.22-lgraph.tar.gz`,
    engineType: 'vosk',
  },
]

export const DEFAULT_MODEL_ID = 'vosk-small-en-us'

export function getModel(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]
}
