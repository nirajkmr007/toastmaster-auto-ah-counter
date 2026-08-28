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
import { buildBlockedSet, maskProfanity } from './detection/profanity'
import { createVoskEngine, type VoskEngine } from './audio/voskEngine'
import { getModel } from './audio/models'
import { applyTheme, getTheme, nextTheme } from './theme'
import './App.css'

const FREQUENCY_WINDOW_MS = 30_000

function App() {
  const engineRef = useRef<VoskEngine | null>(null)
  const detectorRef = useRef<Detector | null>(null)
  const runStartRef = useRef<number | null>(null)

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
  const hardStopMs = useSessionStore((s) => s.hardStopMs)
  const modelId = useSessionStore((s) => s.modelId)
  const transcriptCollapsed = useSessionStore((s) => s.transcriptCollapsed)
  const theme = useSessionStore((s) => s.theme)
  const setTheme = useSessionStore((s) => s.setTheme)
  // The report is available as soon as a speaker exists — the app is fully
  // usable as a manual tally board without ever starting the recognizer, and
  // gating the report on a finished Vosk session hid it from those users.
  const hasSpeakers = useSessionStore((s) => s.speakers.length > 0)
  const hasData = useSessionStore((s) =>
    s.speakers.some(
      (sp) =>
        sp.detectionLog.length > 0 ||
        sp.transcript.length > 0 ||
        sp.speakingMs > 0
    )
  )

  if (!engineRef.current)
    engineRef.current = createVoskEngine(getModel(modelId).url)

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

  // Swapping the model means a different Web Worker and a different download,
  // so tear the old engine down rather than leaking its ~300 MB of runtime
  // memory. The settings toggle is disabled while listening, so this only
  // fires between sessions.
  useEffect(() => {
    const wanted = getModel(modelId).url
    const engine = engineRef.current
    if (!engine || engine.modelUrl === wanted) return
    void engine.dispose()
    engineRef.current = createVoskEngine(wanted)
    setStatus('idle')
  }, [modelId, setStatus])

  // index.html applies the saved theme before React mounts to avoid a flash of
  // the wrong palette; this re-asserts it once the store has rehydrated, which
  // covers the case where that inline script couldn't read localStorage.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

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

      // Blocked list is read live per utterance so edits in Settings take
      // effect mid-session without restarting the recognizers.
      const clean = (text: string) => {
        const s = useSessionStore.getState()
        return maskProfanity(
          text,
          buildBlockedSet(s.extraBlockedWords, s.maskMildWords)
        )
      }

      await engine.start(
        {
          onTranscriptFinal: (text) => {
            const masked = clean(text)
            const dets = detector.process(masked, Date.now())
            addTranscriptWithCrutch(masked, dets)
          },
          onTranscriptPartial: (text) => setPartial(clean(text)),
          onSound: (words) => applySoundDetections(words),
          onError: (err) => {
            const msg = err instanceof Error ? err.message : String(err)
            setStatus('error', msg)
          },
        },
        soundGrammar
      )
      markSessionStart()
      runStartRef.current = Date.now()
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
    runStartRef.current = null
    await engine.stop()
    markSessionEnd()
    setStatus('ready')
    const { speakers } = useSessionStore.getState()
    const anyData = speakers.some(
      (s) => s.detectionLog.length > 0 || s.transcript.length > 0
    )
    if (anyData) openReport()
  }, [setStatus, markSessionEnd, openReport])

  // Safety cap: auto-stop after the hard-stop duration so a session left open
  // by mistake doesn't record indefinitely.
  useEffect(() => {
    if (status !== 'listening') return
    const id = window.setInterval(() => {
      if (runStartRef.current != null && Date.now() - runStartRef.current >= hardStopMs) {
        void handleStop()
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [status, hardStopMs, handleStop])

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
              className="gear-btn theme-btn"
              onClick={() => setTheme(nextTheme(theme))}
              aria-label={`Theme: ${getTheme(theme).label}. Switch to ${
                getTheme(nextTheme(theme)).label
              }`}
              title={`Theme: ${getTheme(theme).label} — click for ${getTheme(
                nextTheme(theme)
              ).label}`}
            >
              {getTheme(theme).glyph}
            </button>
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
        </div>
        <div
          className={`transcript-col${
            transcriptCollapsed ? ' transcript-col-collapsed' : ''
          }`}
        >
          <ManualAdd />
          <TranscriptPane />
        </div>
      </main>

      <footer className="app-footer" data-tour="footer">
        <span className="dim">
          Two Vosk recognizers · session-only, nothing is stored
        </span>
        <div className="footer-actions">
          {hasSpeakers ? (
            <button
              type="button"
              className="footer-btn"
              onClick={openReport}
              title="Open the session report"
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
