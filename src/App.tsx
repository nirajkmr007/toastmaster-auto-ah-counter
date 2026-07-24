import { useCallback, useEffect, useRef, useState } from 'react'
import { Roster } from './components/Roster'
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
  const activeSpeakerId = useSessionStore((s) => s.activeSpeakerId)
  const setStatus = useSessionStore((s) => s.setStatus)
  const addTranscriptLine = useSessionStore((s) => s.addTranscriptLine)
  const setPartial = useSessionStore((s) => s.setPartial)
  const applyDetections = useSessionStore((s) => s.applyDetections)
  const resetSessionData = useSessionStore((s) => s.resetSessionData)
  const markSessionStart = useSessionStore((s) => s.markSessionStart)
  const markSessionEnd = useSessionStore((s) => s.markSessionEnd)
  const openReport = useSessionStore((s) => s.openReport)
  const setLoadingMessage = useSessionStore((s) => s.setLoadingMessage)
  const status = useSessionStore((s) => s.status)
  const hasEndedSession = useSessionStore((s) => s.sessionEndAt !== null)
  const hasData = useSessionStore((s) =>
    s.speakers.some(
      (sp) =>
        sp.detectionLog.length > 0 ||
        sp.transcript.length > 0 ||
        sp.speakingMs > 0
    )
  )

  // Lazy-init engine keyed on selected model. Switching models tears down the
  // old engine so the next Start downloads the new model. Guarded against
  // StrictMode double-render.
  if (
    engineRef.current === null ||
    engineRef.current.modelId !== selectedModelId
  ) {
    if (engineRef.current) void engineRef.current.engine.stop()
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

  useEffect(() => {
    detectorRef.current?.updateConfig({ wordList, sensitivity })
  }, [wordList, sensitivity])

  // Reset the detector's rolling frequency window when the active speaker
  // changes, so one speaker's "so so so" doesn't prime another's threshold.
  useEffect(() => {
    detectorRef.current?.reset()
  }, [activeSpeakerId])

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
    if (useSessionStore.getState().speakers.length === 0) return
    const engine = entry.engine

    // NOTE: we intentionally do NOT clear speaker data here. Start resumes the
    // meeting so stopping between speakers (and starting again) keeps everyone's
    // counts. A fresh meeting is started with the "New session" button.
    detector.reset()
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
          if (detections.length > 0) applyDetections(detections)
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
    setStatus,
    addTranscriptLine,
    setPartial,
    applyDetections,
    markSessionStart,
    setLoadingMessage,
  ])

  const handleNewSession = useCallback(() => {
    resetSessionData()
  }, [resetSessionData])

  const handleStop = useCallback(async () => {
    const entry = engineRef.current
    if (!entry) return
    await entry.engine.stop()
    markSessionEnd()
    setStatus('ready')
    const { speakers } = useSessionStore.getState()
    const anyData = speakers.some(
      (s) => s.detectionLog.length > 0 || s.transcript.length > 0
    )
    if (anyData) openReport()
  }, [setStatus, markSessionEnd, openReport])

  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const handleCopyLog = useCallback(async () => {
    const s = useSessionStore.getState()
    const payload = {
      preset: s.presetName,
      sensitivity: s.sensitivity,
      model: s.selectedModelId,
      speakers: s.speakers.map((sp) => ({
        name: sp.name,
        counts: sp.counts,
        speakingSec: Math.round(sp.speakingMs / 1000),
        detections: sp.detectionLog.map((d) => ({
          word: d.word,
          context: d.context,
          manual: d.manual ?? false,
          timestamp: d.timestamp,
        })),
        transcript: sp.transcript.map((t) => t.text),
      })),
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[ah-counter session log]', payload, err)
    }
  }, [])

  const modelName = getModel(selectedModelId).name

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-title">
            <span className="brand-dot" />
            <h1>Ah-Counter</h1>
          </div>
          <Timer />
        </div>
        <Roster />
        <div className="header-controls">
          <Controls onStart={handleStart} onStop={handleStop} />
        </div>
      </header>

      <main className="app-main">
        <BubblesPane />
        <TranscriptPane />
      </main>

      <footer className="app-footer">
        <span className="dim">
          Model: {modelName} · session-only, nothing is stored
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
          {hasData && status !== 'listening' ? (
            <button
              type="button"
              className="footer-btn footer-btn-danger"
              onClick={handleNewSession}
              title="Clear all counts and transcripts (keeps the speaker roster)"
            >
              New session
            </button>
          ) : null}
          <button
            type="button"
            className="footer-btn"
            onClick={handleCopyLog}
            title="Copy session state as JSON (per speaker)"
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
