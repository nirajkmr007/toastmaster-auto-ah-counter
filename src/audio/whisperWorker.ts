/**
 * Web Worker that runs the transformers.js ASR pipeline off the main thread,
 * so a multi-second Whisper inference never freezes the UI or the bubble
 * animations.
 *
 * Protocol (main → worker):
 *   { type: 'load', modelId }              → load the pipeline
 *   { type: 'transcribe', id, audio }      → transcribe a Float32Array @16 kHz
 * Protocol (worker → main):
 *   { type: 'progress', message }          → human-readable load progress
 *   { type: 'ready' }
 *   { type: 'result', id, text }
 *   { type: 'error', message }
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers'

// Always fetch models from the HF hub (we don't bundle them).
env.allowLocalModels = false
// Single-threaded WASM so we don't require SharedArrayBuffer, which needs
// COOP/COEP headers that static hosts like GitHub Pages can't send.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1
}

let transcriber: any = null

function post(msg: any) {
  ;(self as any).postMessage(msg)
}

function progressCallback(p: any) {
  // transformers.js emits {status, file, progress, loaded, total}
  if (p?.status === 'progress' && p?.file) {
    const pct = typeof p.progress === 'number' ? Math.round(p.progress) : 0
    post({ type: 'progress', message: `Downloading ${p.file} — ${pct}%` })
  } else if (p?.status === 'done' && p?.file) {
    post({ type: 'progress', message: `Loaded ${p.file}` })
  } else if (p?.status === 'ready') {
    post({ type: 'progress', message: 'Initializing model…' })
  }
}

async function load(modelId: string): Promise<void> {
  if (transcriber) return
  // Prefer WebGPU (much faster); fall back to WASM/CPU if unavailable.
  try {
    post({ type: 'progress', message: 'Loading model (WebGPU)…' })
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      dtype: 'q4',
      device: 'webgpu',
      progress_callback: progressCallback,
    })
  } catch (gpuErr) {
    post({
      type: 'progress',
      message: 'WebGPU unavailable, falling back to CPU (slower)…',
    })
    // eslint-disable-next-line no-console
    console.warn('[ah-counter] WebGPU load failed, trying wasm:', gpuErr)
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: progressCallback,
    })
  }
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data
  try {
    if (msg.type === 'load') {
      await load(msg.modelId)
      post({ type: 'ready' })
      return
    }

    if (msg.type === 'transcribe') {
      if (!transcriber) throw new Error('Pipeline not loaded')
      const audio: Float32Array = msg.audio
      const out = await transcriber(audio, { chunk_length_s: 30 })
      const text = (Array.isArray(out) ? out[0]?.text : out?.text) ?? ''
      post({ type: 'result', id: msg.id, text })
      return
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'error', message })
  }
}
