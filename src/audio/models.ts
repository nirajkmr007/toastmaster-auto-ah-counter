/**
 * Model catalog — the source of truth for which STT models the app offers.
 *
 * Only URLs verified to actually serve a tar.gz should live in the main
 * MODELS array. ccoreilly's gh-pages mirror hosts the small en-US model
 * (verified) but the larger en-US and en-IN variants that some earlier
 * docs describe aren't present there — you'll get a 404 on fetch.
 *
 * The reliable way to offer more models is to self-host: drop the .tar.gz
 * under `public/models/` and reference it via BASE_URL. See README for the
 * step-by-step ("Adding a new model" → "Self-hosting").
 */

export type EngineType = 'vosk' | 'transformers-whisper'

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
    id: 'vosk-en-us-lgraph',
    name: 'Vosk large (en-US, lgraph)',
    language: 'en-US',
    approxSizeMB: 128,
    description:
      'More accurate than the small model, still streams word-by-word. ' +
      'Larger first-load download; best on desktop. Self-hosted — run ' +
      'scripts/fetch-models.sh.',
    url: `${import.meta.env.BASE_URL}models/vosk-model-en-us-0.22-lgraph.tar.gz`,
    engineType: 'vosk',
  },
  {
    id: 'vosk-small-en-in',
    name: 'Vosk small (en-IN, Indian English)',
    language: 'en-IN',
    approxSizeMB: 36,
    description:
      'Tuned for Indian English pronunciation. Streams word-by-word. ' +
      'Self-hosted — run scripts/fetch-models.sh.',
    url: `${import.meta.env.BASE_URL}models/vosk-model-small-en-in-0.4.tar.gz`,
    engineType: 'vosk',
  },
  {
    id: 'crisperwhisper',
    name: 'CrisperWhisper (verbatim, large)',
    language: 'en',
    approxSizeMB: 500,
    description:
      'Whisper fine-tuned to keep every um/uh. Most accurate on fillers, ' +
      'but a large first-load download and needs a modern browser (WebGPU ' +
      'recommended). Transcribes in ~6s segments, not word-by-word.',
    // transformers.js resolves this against the HuggingFace hub; it is a
    // model repo id, not a tarball URL like the Vosk entries.
    url: 'onnx-community/CrisperWhisper-ONNX',
    engineType: 'transformers-whisper',
  },
]

export const DEFAULT_MODEL_ID = 'vosk-small-en-us'

export function getModel(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]
}
