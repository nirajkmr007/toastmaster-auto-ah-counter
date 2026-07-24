/**
 * Web Worker that runs the transformers.js ASR pipeline off the main thread,
 * so a multi-second Whisper inference never freezes the UI or the bubble
 * animations.
 *
 * Protocol (main → worker):
 *   { type: 'load', modelId }              → load the pipeline
 *   { type: 'transcribe', id, audio }      → transcribe a Float32Array @16 kHz
 * Protocol (worker → main):
 *   { type: 'ready' }
 *   { type: 'result', id, text }
 *   { type: 'error', message }
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers'

// Always fetch models from the HF hub (we don't bundle them).
env.allowLocalModels = false

let transcriber: any = null

async function load(modelId: string): Promise<void> {
  if (transcriber) return
  // Prefer WebGPU (much faster); fall back to WASM/CPU if unavailable.
  try {
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      dtype: 'q4',
      device: 'webgpu',
    })
  } catch {
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      dtype: 'q8',
      device: 'wasm',
    })
  }
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data
  try {
    if (msg.type === 'load') {
      await load(msg.modelId)
      ;(self as any).postMessage({ type: 'ready' })
      return
    }

    if (msg.type === 'transcribe') {
      if (!transcriber) throw new Error('Pipeline not loaded')
      const audio: Float32Array = msg.audio
      // CrisperWhisper keeps disfluencies; no need for special decoding flags.
      const out = await transcriber(audio, {
        chunk_length_s: 30,
        // language/task are auto for the .en-style large-v3 base; leaving
        // defaults gives verbatim output including um/uh.
      })
      const text = (Array.isArray(out) ? out[0]?.text : out?.text) ?? ''
      ;(self as any).postMessage({ type: 'result', id: msg.id, text })
      return
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ;(self as any).postMessage({ type: 'error', message })
  }
}
