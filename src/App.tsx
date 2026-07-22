import { useCallback, useEffect, useRef, useState } from 'react'
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

    // Hold the UI in the "starting" state for the entire startup — including
    // the mic-permission prompt — so Stop can't be clicked before capture is
    // actually running (which would leak a mic stream started later) and a
    // second Start click can't spawn a second recognizer.
    setStatus('loading-model')

    try {
      if (!engine.isModelLoaded()) {
        await engine.loadModel(MODEL_URL)
      }

      await engine.start({
        onFinal: (text) => {
          addTranscriptLine(text)
          const detections = detector.process(text, Date.now())
          if (detections.length > 0) {
            applyDetections(detections)
            // Useful for AH-5 offline scoring: each detection logged with
            // the tokens on either side of the hit.
            for (const d of detections) {
              // eslint-disable-next-line no-console
              console.log('[ah-counter]', d.word, '·', d.context)
            }
          }
        },
        onPartial: (text) => setPartial(text),
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err)
          setStatus('error', msg)
        },
      })
      setStatus('listening')
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

  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const handleCopyLog = useCallback(async () => {
    const s = useSessionStore.getState()
    const payload = {
      speaker: s.speakerName,
      preset: s.presetName,
      sensitivity: s.sensitivity,
      counts: s.counts,
      detections: s.detectionLog.map((d) => ({
        word: d.word,
        context: d.context,
        timestamp: d.timestamp,
      })),
      transcript: s.transcript.map((t) => t.text),
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch (err) {
      // Fallback: log so user can still grab it from DevTools.
      // eslint-disable-next-line no-console
      console.log('[ah-counter session log]', payload, err)
    }
  }, [])

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
        <button
          type="button"
          className="footer-btn"
          onClick={handleCopyLog}
          title="Copy session state as JSON (counts, detections, transcript)"
        >
          {copyState === 'copied' ? 'Copied ✓' : 'Copy session log'}
        </button>
      </footer>
    </div>
  )
}

export default App
