/**
 * Dual-recognizer Vosk engine.
 *
 * One model is loaded and drives TWO recognizers fed the same audio:
 *   A) full grammar  -> the transcript (and, via text rules elsewhere, crutch
 *      words like "so"/"like").
 *   B) restricted grammar -> only filler SOUNDS (um/uh/er/ah/hmm) plus [unk];
 *      it is forced to choose a filler or [unk], so it catches the hesitations
 *      the full model tends to smooth into real words.
 *
 * This replaces the offline language-model tuning entirely — recognizer B's
 * grammar is set at runtime from the sound-filler list.
 *
 * vosk-browser runs its own Web Worker; we feed both recognizers from a
 * ScriptProcessorNode (deprecated but universally supported).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createModel } from 'vosk-browser'
import { canonicalFiller } from '../detection/detector'

export interface VoskHandlers {
  onTranscriptPartial: (text: string) => void
  onTranscriptFinal: (text: string) => void
  onSound: (words: string[]) => void // canonical sound-filler tokens from recognizer B
  onError: (err: unknown) => void
}

export interface VoskEngine {
  loadModel: (onProgress?: (message: string) => void) => Promise<void>
  start: (handlers: VoskHandlers, soundGrammar: string[]) => Promise<void>
  stop: () => Promise<void>
  isModelLoaded: () => boolean
  /** Which model URL this engine was built for. */
  modelUrl: string
  /**
   * Release the model and its Web Worker. Required when switching models —
   * each model spawns its own worker holding ~300 MB of runtime memory, so
   * dropping the reference without terminating would leak it.
   */
  dispose: () => Promise<void>
}

export function createVoskEngine(modelUrl: string): VoskEngine {
  let model: any = null
  let modelLoadPromise: Promise<any> | null = null
  let recA: any = null
  let recB: any = null
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let processorNode: ScriptProcessorNode | null = null

  const loadModel = async (onProgress?: (message: string) => void): Promise<void> => {
    if (model) return
    onProgress?.('Downloading model…')
    if (!modelLoadPromise) modelLoadPromise = createModel(modelUrl)
    try {
      model = await modelLoadPromise
    } catch (err) {
      modelLoadPromise = null
      const msg = err instanceof Error ? err.message : String(err)
      // "Failed to fetch" is what the browser reports for both a dead network
      // and a blocked cross-origin request, and the CORS detail only appears in
      // the console. Say so, rather than leaving the user with four useless
      // words.
      const crossOrigin =
        !modelUrl.startsWith(window.location.origin) &&
        /failed to fetch|networkerror|load failed/i.test(msg)
      throw new Error(
        crossOrigin
          ? `Couldn't download the speech model. It's hosted on another domain ` +
            `(${new URL(modelUrl).host}) which isn't sending the CORS headers a ` +
            `browser needs. Check the console for details.`
          : `Couldn't load the speech model from ${modelUrl} (${msg}).`
      )
    }
  }

  const start = async (handlers: VoskHandlers, soundGrammar: string[]): Promise<void> => {
    if (!model) throw new Error('Model not loaded — call loadModel() first')
    if (recA || recB) throw new Error('Engine already running')

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
    const rate = audioContext.sampleRate

    // A: full-vocabulary transcript.
    recA = new model.KaldiRecognizer(rate)
    recA.on('result', (msg: any) => {
      const text: string = msg?.result?.text ?? ''
      if (text.trim()) handlers.onTranscriptFinal(text)
    })
    recA.on('partialresult', (msg: any) => {
      handlers.onTranscriptPartial(msg?.result?.partial ?? '')
    })
    recA.on('error', (err: unknown) => handlers.onError(err))

    // B: grammar restricted to filler sounds + [unk]. Everything that isn't a
    // filler is forced to [unk], which we ignore.
    const grammarWords = Array.from(new Set(soundGrammar.map((w) => w.toLowerCase().trim()).filter(Boolean)))
    const validSounds = new Set(grammarWords.map(canonicalFiller))
    const grammar = JSON.stringify([...grammarWords, '[unk]'])
    recB = new model.KaldiRecognizer(rate, grammar)
    recB.on('result', (msg: any) => {
      const text: string = msg?.result?.text ?? ''
      if (!text.trim()) return
      const words = text
        .split(/\s+/)
        .filter((w) => w && w !== '[unk]')
        .map(canonicalFiller)
        .filter((w) => validSounds.has(w))
      if (words.length > 0) handlers.onSound(words)
    })
    recB.on('error', (err: unknown) => handlers.onError(err))

    sourceNode = audioContext.createMediaStreamSource(mediaStream)
    processorNode = audioContext.createScriptProcessor(4096, 1, 1)
    processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      try {
        recA.acceptWaveform(event.inputBuffer)
        recB.acceptWaveform(event.inputBuffer)
      } catch (e) {
        handlers.onError(e)
      }
    }
    sourceNode.connect(processorNode)
    processorNode.connect(audioContext.destination)
  }

  const stop = async (): Promise<void> => {
    processorNode?.disconnect()
    sourceNode?.disconnect()
    processorNode = null
    sourceNode = null

    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null

    for (const r of [recA, recB]) {
      if (r) {
        try {
          r.remove()
        } catch {
          // ignore
        }
      }
    }
    recA = null
    recB = null

    if (audioContext) {
      try {
        await audioContext.close()
      } catch {
        // ignore
      }
      audioContext = null
    }
  }

  const isModelLoaded = (): boolean => model !== null

  const dispose = async (): Promise<void> => {
    await stop()
    if (model) {
      try {
        model.terminate()
      } catch {
        // ignore
      }
      model = null
    }
    modelLoadPromise = null
  }

  return { loadModel, start, stop, isModelLoaded, dispose, modelUrl }
}
