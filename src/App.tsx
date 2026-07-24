import { useCallback, useEffect, useRef, useState } from 'react'
import { NameEntry } from './components/NameEntry'
import { Controls } from './components/Controls'
import { BubblesPane } from './components/BubblesPane'
import { TranscriptPane } from './components/TranscriptPane'
import { SessionReport } from './components/SessionReport'
import { Timer } from './components/Timer'
import { useSessionStore } from './store'
import { createDetector, type Detector } from './detection/detector'
import { createEngine, type SttEngine } from './audio/sttEngine'
import { getModel } from './audio/models'
import './App.css'

const FREQUENCY_WINDOW_MS = 30_000

function App() {
  const engineRef = useRef<{ modelId: string; engine: SttEngine } | null>(null)
  const detectorRef = useRef<Detector | null>(null)

  const wordList = useSessionStore((s) => s.wordList)
  const sensitivity = useSessionStore((s) => s.sensitivity)
  const selectedModelId = useSessionStore((s) => s.selectedModelId)
  const setStatus = useSessionStore((s) => s.setStatus)
  const addTranscriptLine = useSessionStore((s) => s.addTranscriptLine)
  const setPartial = useSessionStore((s) => s.setPartial)
  const applyDetections = useSessionStore((s) => s.applyDetections)
  const resetSession = useSessionStore((s) => s.resetSession)
  const markSessionStart = useSessionStore((s) => s.markSessionStart)
  const markSessionEnd = useSessionStore((s) => s.markSessionEnd)
  const openReport = useSessionStore((s) => s.openReport)
  const setLoadingMessage = useSessionStore((s) => s.setLoadingMessage)
  const hasEndedSession = useSessionStore((s) => s.sessionEndAt !== null)

  // Lazy-init engine keyed on selected model. If the user switches models,
  // the current engine is torn down and a fresh one is spun up so the next
  // Start downloads the new model. Guarded so React StrictMode's
  // double-render doesn't double-instantiate.
  if (
    engineRef.current === null ||
    engineRef.current.modelId !== selectedModelId
  ) {
    if (engineRef.current) {
      void engineRef.current.engine.stop()
    }
    engineRef.current = {
      modelId: selectedModelId,
      engine: createEngine(getModel(selectedModelId)),
    }
  }

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
      if (engineRef.current) {
        void engineRef.current.engine.stop()
        engineRef.current = null
      }
    }
  }, [])

  const handleStart = useCallback(async () => {
    const entry = engineRef.current
    const detector = detectorRef.current
    if (!entry || !detector) return
    const engine = entry.engine

    resetSession()
    detector.reset()

    // Hold the UI in the "starting" state for the entire startup — including
    // the mic-permission prompt — so Stop can't be clicked before capture is
    // actually running (which would leak a mic stream started later) and a
    // second Start click can't spawn a second recognizer.
    setStatus('loading-model')

    try {
      if (!engine.isModelLoaded()) {
        await engine.loadModel((msg) => setLoadingMessage(msg))
      }
      setLoadingMessage(null)

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
      markSessionStart()
      setStatus('listening')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLoadingMessage(null)
      setStatus('error', msg)
    }
  }, [
    resetSession,
    setStatus,
    addTranscriptLine,
    setPartial,
    applyDetections,
    markSessionStart,
    setLoadingMessage,
  ])

  const handleStop = useCallback(async () => {
    const entry = engineRef.current
    if (!entry) return
    await entry.engine.stop()
    markSessionEnd()
    setStatus('ready')
    // Only surface the report if there's something worth showing.
    const { detectionLog, transcript } = useSessionStore.getState()
    if (detectionLog.length > 0 || transcript.length > 0) openReport()
  }, [setStatus, markSessionEnd, openReport])

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
          <div className="brand-title">
            <span className="brand-dot" />
            <h1>Ah-Counter</h1>
          </div>
          <Timer onAutoStop={handleStop} />
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
        <div className="footer-actions">
          {hasEndedSession ? (
            <button
              type="button"
              className="footer-btn"
              onClick={openReport}
              title="Reopen the last session report"
            >
              View report
            </button>
          ) : null}
          <button
            type="button"
            className="footer-btn"
            onClick={handleCopyLog}
            title="Copy session state as JSON (counts, detections, transcript)"
          >
            {copyState === 'copied' ? 'Copied ✓' : 'Copy session log'}
          </button>
        </div>
      </footer>

      <SessionReport />
    </div>
  )
}

export default App
