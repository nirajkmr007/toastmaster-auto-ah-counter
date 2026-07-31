import { useCallback, useEffect, useRef, useState } from 'react'
import { Roster } from './components/Roster'
import { Controls } from './components/Controls'
import { FillerPane } from './components/FillerPane'
import { ManualAdd } from './components/ManualAdd'
import { TranscriptPane } from './components/TranscriptPane'
import { SessionReport } from './components/SessionReport'
import { SettingsPanel } from './components/SettingsPanel'
import { Timer } from './components/Timer'
import { Tour, TOUR_SEEN_KEY } from './components/Tour'
import { useSessionStore } from './store'
import { createDetector, type Detector } from './detection/detector'
import { createVoskEngine, type VoskEngine } from './audio/voskEngine'
import { MODEL_URL } from './audio/models'
import './App.css'

const FREQUENCY_WINDOW_MS = 30_000

function App() {
  const engineRef = useRef<VoskEngine | null>(null)
  const detectorRef = useRef<Detector | null>(null)

  const wordList = useSessionStore((s) => s.wordList)
  const sensitivity = useSessionStore((s) => s.sensitivity)
  const activeSpeakerId = useSessionStore((s) => s.activeSpeakerId)
  const setStatus = useSessionStore((s) => s.setStatus)
  const addTranscriptWithCrutch = useSessionStore((s) => s.addTranscriptWithCrutch)
  const setPartial = useSessionStore((s) => s.setPartial)
  const applySoundDetections = useSessionStore((s) => s.applySoundDetections)
  const resetSessionData = useSessionStore((s) => s.resetSessionData)
  const markSessionStart = useSessionStore((s) => s.markSessionStart)
  const markSessionEnd = useSessionStore((s) => s.markSessionEnd)
  const openReport = useSessionStore((s) => s.openReport)
  const setLoadingMessage = useSessionStore((s) => s.setLoadingMessage)
  const openSettings = useSessionStore((s) => s.openSettings)
  const openTour = useSessionStore((s) => s.openTour)
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

  if (!engineRef.current) engineRef.current = createVoskEngine(MODEL_URL)

  // Recognizer A's transcript is scanned for CRUTCH words only — sound fillers
  // come from recognizer B. So the detector runs with an empty sound list.
  if (!detectorRef.current) {
    detectorRef.current = createDetector({
      wordList: { ...wordList, soundFillers: [] },
      sensitivity,
      frequencyWindowMs: FREQUENCY_WINDOW_MS,
    })
  }

  useEffect(() => {
    detectorRef.current?.updateConfig({
      wordList: { ...wordList, soundFillers: [] },
      sensitivity,
    })
  }, [wordList, sensitivity])

  // Reset the rolling frequency window when the active speaker changes.
  useEffect(() => {
    detectorRef.current?.reset()
  }, [activeSpeakerId])

  useEffect(() => {
    return () => {
      if (engineRef.current) {
        void engineRef.current.stop()
        engineRef.current = null
      }
    }
  }, [])

  // Auto-open the guided tour on a visitor's first landing.
  useEffect(() => {
    let seen = false
    try {
      seen = localStorage.getItem(TOUR_SEEN_KEY) === '1'
    } catch {
      // ignore
    }
    if (!seen) openTour()
  }, [openTour])

  const handleStart = useCallback(async () => {
    const engine = engineRef.current
    const detector = detectorRef.current
    if (!engine || !detector) return
    if (useSessionStore.getState().speakers.length === 0) return

    detector.reset()
    setStatus('loading-model')

    try {
      if (!engine.isModelLoaded()) {
        await engine.loadModel((msg) => setLoadingMessage(msg))
      }
      setLoadingMessage(null)

      const soundGrammar = useSessionStore.getState().wordList.soundFillers

      await engine.start(
        {
          onTranscriptFinal: (text) => {
            const dets = detector.process(text, Date.now())
            addTranscriptWithCrutch(text, dets)
          },
          onTranscriptPartial: (text) => setPartial(text),
          onSound: (words) => applySoundDetections(words),
          onError: (err) => {
            const msg = err instanceof Error ? err.message : String(err)
            setStatus('error', msg)
          },
        },
        soundGrammar
      )
      markSessionStart()
      setStatus('listening')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLoadingMessage(null)
      setStatus('error', msg)
    }
  }, [
    setStatus,
    addTranscriptWithCrutch,
    setPartial,
    applySoundDetections,
    markSessionStart,
    setLoadingMessage,
  ])

  const handleNewSession = useCallback(() => {
    resetSessionData()
  }, [resetSessionData])

  const handleStop = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    await engine.stop()
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
      speakers: s.speakers.map((sp) => ({
        name: sp.name,
        soundCounts: sp.soundCounts,
        crutchCounts: sp.crutchCounts,
        speakingSec: Math.round(sp.speakingMs / 1000),
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-title">
            <span className="brand-dot" />
            <h1>Ah-Counter</h1>
          </div>
          <div className="brand-right">
            <Timer />
            <button
              type="button"
              className="gear-btn"
              onClick={openTour}
              aria-label="Take the app tour"
              title="Take the app tour"
            >
              ?
            </button>
            <button
              type="button"
              className="gear-btn"
              data-tour="settings"
              onClick={openSettings}
              aria-label="Manage filler words"
              title="Manage filler words"
            >
              ⚙
            </button>
          </div>
        </div>
        <div className="setup-row">
          <Roster />
          <Controls onStart={handleStart} onStop={handleStop} />
        </div>
      </header>

      <main className="app-main">
        <div className="fillers-col">
          <FillerPane kind="crutch" />
          <FillerPane kind="sound" />
          <ManualAdd />
        </div>
        <TranscriptPane />
      </main>

      <footer className="app-footer" data-tour="footer">
        <span className="dim">
          Two Vosk recognizers · session-only, nothing is stored
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
      <SettingsPanel />
      <Tour />
    </div>
  )
}

export default App
