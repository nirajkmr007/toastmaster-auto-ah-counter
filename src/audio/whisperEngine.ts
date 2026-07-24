/**
 * transformers.js (CrisperWhisper) implementation of SttEngine.
 *
 * Whisper is NOT a streaming model — transformers.js transcribes fixed audio
 * segments. So this engine captures mic audio, accumulates it, and every
 * CHUNK_SECONDS flushes one *non-overlapping* segment to the worker for
 * transcription. Non-overlapping matters: overlapping windows would make the
 * filler counter double-count a word caught in two windows.
 *
 * Trade-off vs Vosk: higher latency (you see a line every CHUNK_SECONDS
 * rather than word-by-word) and a much larger first-load download, in
 * exchange for verbatim disfluency accuracy. Heavy inference runs in a Web
 * Worker (see whisperWorker.ts) so the UI stays smooth.
 */

import type { SttEngine, SttHandlers } from './sttEngine'

const TARGET_SAMPLE_RATE = 16_000 // Whisper expects 16 kHz mono
const CHUNK_SECONDS = 6 // segment length flushed to the model

// Downsample a Float32 PCM buffer from `inRate` to 16 kHz via linear
// interpolation. Good enough for speech; Whisper is robust to it.
function resampleTo16k(input: Float32Array, inRate: number): Float32Array {
  if (inRate === TARGET_SAMPLE_RATE) return input
  const ratio = inRate / TARGET_SAMPLE_RATE
  const outLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio
    const i0 = Math.floor(srcPos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = srcPos - i0
    output[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return output
}

export function createWhisperEngine(modelId: string): SttEngine {
  let worker: Worker | null = null
  let workerReady = false
  let loading = false
  let readyResolvers: { resolve: () => void; reject: (e: unknown) => void }[] = []
  let progressCb: ((msg: string) => void) | null = null

  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let processorNode: ScriptProcessorNode | null = null

  let handlers: SttHandlers | null = null
  let buffers: Float32Array[] = []
  let bufferedSamples = 0
  let inputSampleRate = 48_000
  let seq = 0

  const rejectPending = (err: unknown): void => {
    loading = false
    readyResolvers.forEach((r) => r.reject(err))
    readyResolvers = []
  }

  const ensureWorker = (): Worker => {
    if (worker) return worker
    worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'progress') {
        progressCb?.(msg.message)
      } else if (msg.type === 'ready') {
        workerReady = true
        loading = false
        readyResolvers.forEach((r) => r.resolve())
        readyResolvers = []
      } else if (msg.type === 'result') {
        const text: string = (msg.text ?? '').trim()
        if (text) handlers?.onFinal(text)
      } else if (msg.type === 'error') {
        // A load-time error must reject the pending loadModel() promise —
        // otherwise the UI hangs on "Starting…" forever. A run-time error
        // (after ready) goes to the session error handler.
        if (!workerReady) {
          rejectPending(new Error(msg.message))
        } else {
          handlers?.onError(new Error(msg.message))
        }
      }
    }
    worker.onerror = (e) => {
      if (!workerReady) rejectPending(e)
      else handlers?.onError(e)
    }
    return worker
  }

  const loadModel = async (onProgress?: (msg: string) => void): Promise<void> => {
    if (workerReady) return
    progressCb = onProgress ?? null
    const w = ensureWorker()
    await new Promise<void>((resolve, reject) => {
      readyResolvers.push({ resolve, reject })
      if (!loading) {
        loading = true
        w.postMessage({ type: 'load', modelId })
      }
    })
  }

  const flushSegment = (): void => {
    if (bufferedSamples === 0 || !worker) return
    // Concatenate accumulated raw PCM.
    const merged = new Float32Array(bufferedSamples)
    let offset = 0
    for (const b of buffers) {
      merged.set(b, offset)
      offset += b.length
    }
    buffers = []
    bufferedSamples = 0

    const audio16k = resampleTo16k(merged, inputSampleRate)
    worker.postMessage({ type: 'transcribe', id: ++seq, audio: audio16k })
  }

  const start = async (h: SttHandlers): Promise<void> => {
    if (!workerReady) throw new Error('Model not loaded — call loadModel() first')
    if (mediaStream) throw new Error('Engine already running')
    handlers = h

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    })

    audioContext = new AudioContext()
    if (audioContext.state === 'suspended') await audioContext.resume()
    inputSampleRate = audioContext.sampleRate

    const samplesPerChunk = CHUNK_SECONDS * inputSampleRate

    sourceNode = audioContext.createMediaStreamSource(mediaStream)
    processorNode = audioContext.createScriptProcessor(4096, 1, 1)
    processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      const channel = event.inputBuffer.getChannelData(0)
      // Copy — the underlying buffer is reused by the audio thread.
      buffers.push(new Float32Array(channel))
      bufferedSamples += channel.length
      if (bufferedSamples >= samplesPerChunk) flushSegment()
    }
    sourceNode.connect(processorNode)
    processorNode.connect(audioContext.destination)
  }

  const stop = async (): Promise<void> => {
    // Flush whatever remains so the tail of the session isn't lost.
    flushSegment()

    processorNode?.disconnect()
    sourceNode?.disconnect()
    processorNode = null
    sourceNode = null

    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null

    if (audioContext) {
      try {
        await audioContext.close()
      } catch {
        // ignore
      }
      audioContext = null
    }
    // Keep the worker + loaded model warm for the next session.
  }

  const isModelLoaded = (): boolean => workerReady

  return { loadModel, start, stop, isModelLoaded }
}
