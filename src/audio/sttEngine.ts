/**
 * SttEngine — pluggable STT engine interface.
 *
 * The app hard-codes nothing about Vosk above this layer. To add a new
 * engine (e.g., Web Speech API, whisper.cpp-wasm, CrisperWhisper):
 *   1. Implement `SttEngine` in a new file under `src/audio/`.
 *   2. Add a new value to `EngineType` in `models.ts`.
 *   3. Add a new `case` in `createEngine` below that returns your factory.
 *   4. Add a `ModelInfo` entry in the catalog for each of your models.
 *
 * That's it — the UI, store, App wiring, and analytics all keep working
 * because they only touch this interface.
 */

import type { ModelInfo } from './models'
import { createVoskEngine } from './voskEngine'

export interface SttHandlers {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (err: unknown) => void
}

export interface SttEngine {
  loadModel: () => Promise<void>
  start: (handlers: SttHandlers) => Promise<void>
  stop: () => Promise<void>
  isModelLoaded: () => boolean
}

export function createEngine(model: ModelInfo): SttEngine {
  if (model.engineType === 'vosk') {
    return createVoskEngine(model.url)
  }
  throw new Error(`Unknown STT engine type: ${model.engineType}`)
}
