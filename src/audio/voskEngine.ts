/**
 * Vosk implementation of the SttEngine interface.
 *
 * vosk-browser handles its own Web Worker internally; we just feed it audio
 * from a ScriptProcessorNode. ScriptProcessorNode is deprecated but still
 * works everywhere and matches vosk-browser's canonical example. Swap for
 * AudioWorklet once we care about jank at higher sample rates.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createModel } from 'vosk-browser'
import type { SttEngine, SttHandlers } from './sttEngine'

export function createVoskEngine(modelUrl: string): SttEngine {
  let model: any = null
  let modelLoadPromise: Promise<any> | null = null
  let recognizer: any = null
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let processorNode: ScriptProcessorNode | null = null

  const loadModel = async (): Promise<void> => {
    if (model) return
    if (!modelLoadPromise) modelLoadPromise = createModel(modelUrl)
    model = await modelLoadPromise
  }

  const start = async (handlers: SttHandlers): Promise<void> => {
    if (!model) throw new Error('Model not loaded — call loadModel() first')
    if (recognizer) throw new Error('Engine already running')

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

    recognizer = new model.KaldiRecognizer(audioContext.sampleRate)
    // Return timing-per-word if the model supports it; harmless if not.
    try {
      recognizer.setWords(true)
    } catch {
      // ignore — some builds don't expose setWords
    }

    recognizer.on('result', (msg: any) => {
      const text: string = msg?.result?.text ?? ''
      if (text.trim()) handlers.onFinal(text)
    })
    recognizer.on('partialresult', (msg: any) => {
      const text: string = msg?.result?.partial ?? ''
      handlers.onPartial(text)
    })
    recognizer.on('error', (err: unknown) => handlers.onError(err))

    sourceNode = audioContext.createMediaStreamSource(mediaStream)
    processorNode = audioContext.createScriptProcessor(4096, 1, 1)
    processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      try {
        recognizer.acceptWaveform(event.inputBuffer)
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

    if (recognizer) {
      try {
        recognizer.remove()
      } catch {
        // ignore
      }
      recognizer = null
    }

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

  return { loadModel, start, stop, isModelLoaded }
}
