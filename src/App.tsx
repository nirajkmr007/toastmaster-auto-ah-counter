import { useCallback, useEffect, useRef } from 'react'
import { NameEntry } from './components/NameEntry'
import { Controls } from './components/Controls'
import { BubblesPane } from './components/BubblesPane'
import { TranscriptPane } from './components/TranscriptPane'
import { useSessionStore } from './store'
import { createDetector, type Detector } from './detection/detector'
import { createVoskEngine, type VoskEngine } from './audio/voskEngine'
import './App.css'

const DEFAULT_MODEL_URL =
  'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz'

const MODEL_URL = import.meta.env.VITE_VOSK_MODEL_URL ?? DEFAULT_MODEL_URL

const FREQUENCY_WINDOW_MS = 30_000

function App() {
  const engineRef = useRef<VoskEngine | null>(null)
  const detectorRef = useRef<Detector | null>(null)

  const wordList = useSessionStore((s) => s.wordList)
  const sensitivity = useSessionStore((s) => s.sensitivity)
  const setStatus = useSessionStore((s) => s.setStatus)
  const addTranscriptLine = useSessionStore((s) => s.addTranscriptLine)
  const setPartial = useSessionStore((s) => s.setPartial)
  const applyDetections = useSessionStore((s) => s.applyDetections)
  const resetSession = useSessionStore((s) => s.resetSession)

  // Lazy-init engine and detector once.
  if (!engineRef.current) engineRef.current = createVoskEngine()
  if (!detectorRef.current) {
    detectorRef.current = createDetector({
      wordList,
      sensitivity,
      frequencyWindowMs: FREQUENCY_WINDOW_MS,
    })
  }

  // Keep detector config in sync with store (only while idle — Controls
  // disables the selects during listening, so this is safe).
  useEffect(() => {
    detectorRef.current?.updateConfig({ wordList, sensitivity })
  }, [wordList, sensitivity])

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      void engineRef.current?.stop()
    }
  }, [])

  const handleStart = useCallback(async () => {
    const engine = engineRef.current
    const detector = detectorRef.current
    if (!engine || !detector) return

    resetSession()
    detector.reset()

    try {
      if (!engine.isModelLoaded()) {
        setStatus('loading-model')
        await engine.loadModel(MODEL_URL)
      }

      setStatus('listening')
      await engine.start({
        onFinal: (text) => {
          addTranscriptLine(text)
          const detections = detector.process(text, Date.now())
          if (detections.length > 0) applyDetections(detections)
        },
        onPartial: (text) => setPartial(text),
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err)
          setStatus('error', msg)
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus('error', msg)
    }
  }, [
    resetSession,
    setStatus,
    addTranscriptLine,
    setPartial,
    applyDetections,
  ])

  const handleStop = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    await engine.stop()
    setStatus('ready')
  }, [setStatus])

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-dot" />
          <h1>Ah-Counter</h1>
        </div>
        <div className="header-controls">
          <NameEntry />
          <Controls onStart={handleStart} onStop={handleStop} />
        </div>
      </header>

      <main className="app-main">
        <BubblesPane />
        <TranscriptPane />
      </main>

      <footer className="app-footer">
        <span className="dim">
          Model: Vosk small-en-us · session-only, nothing is stored
        </span>
      </footer>
    </div>
  )
}

export default App
