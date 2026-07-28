import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Detection, Sensitivity, WordList } from './detection/detector'
import { canonicalFiller } from './detection/detector'
import { TOASTMASTERS_CLASSIC } from './detection/presets'
import { DEFAULT_MODEL_ID } from './audio/models'

export type FillerGroup = 'sound' | 'word'

export type EngineStatus =
  | 'idle'
  | 'loading-model'
  | 'ready'
  | 'listening'
  | 'error'

export interface TranscriptLine {
  id: string
  text: string
  timestamp: number
}

// One bucket per speaker in the meeting. All live data (counts, transcript,
// detections, speaking time) is per-speaker; the flat single-speaker model is
// just a roster of one.
export interface Speaker {
  id: string
  name: string
  counts: Record<string, number>
  detectionLog: Detection[]
  transcript: TranscriptLine[]
  partialText: string
  speakingMs: number // accumulated active listening time
  activeSince: number | null // set while this speaker is the active one AND listening
}

export interface SessionState {
  status: EngineStatus
  errorMessage: string | null

  wordList: WordList
  sensitivity: Sensitivity
  presetName: string

  speakers: Speaker[]
  activeSpeakerId: string | null

  sessionStartAt: number | null
  sessionEndAt: number | null
  showReport: boolean
  showSettings: boolean

  targetDurationMs: number | null // per-speech time guide (green/yellow/red)

  selectedModelId: string
  loadingMessage: string | null

  // config
  setStatus: (status: EngineStatus, errorMessage?: string | null) => void
  setSensitivity: (s: Sensitivity) => void
  setPreset: (name: string, list: WordList) => void
  setTargetDuration: (ms: number | null) => void
  setSelectedModel: (id: string) => void
  setLoadingMessage: (msg: string | null) => void

  // filler-word management
  addFiller: (word: string, group: FillerGroup) => void
  removeFiller: (word: string) => void
  openSettings: () => void
  closeSettings: () => void

  // roster
  addSpeaker: (name: string) => void
  removeSpeaker: (id: string) => void
  setActiveSpeaker: (id: string) => void

  addTranscriptLine: (text: string) => void
  setPartial: (text: string) => void
  applyDetections: (detections: Detection[]) => void
  addManualDetection: (word: string) => void

  // session lifecycle
  markSessionStart: () => void
  markSessionEnd: () => void
  openReport: () => void
  closeReport: () => void
  resetSessionData: () => void
}

function newSpeaker(name: string): Speaker {
  return {
    id: crypto.randomUUID(),
    name,
    counts: {},
    detectionLog: [],
    transcript: [],
    partialText: '',
    speakingMs: 0,
    activeSince: null,
  }
}

// Fold a speaker's open active interval into their accumulated speakingMs.
function flushSpeaking(sp: Speaker, now: number): Speaker {
  if (sp.activeSince == null) return sp
  return { ...sp, speakingMs: sp.speakingMs + (now - sp.activeSince), activeSince: null }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
  status: 'idle',
  errorMessage: null,

  wordList: TOASTMASTERS_CLASSIC,
  sensitivity: 'extra-strict',
  presetName: 'Toastmasters Classic',

  speakers: [],
  activeSpeakerId: null,

  sessionStartAt: null,
  sessionEndAt: null,
  showReport: false,
  showSettings: false,

  targetDurationMs: null,

  selectedModelId: DEFAULT_MODEL_ID,
  loadingMessage: null,

  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
  setSensitivity: (sensitivity) => set({ sensitivity }),
  setPreset: (presetName, wordList) => set({ presetName, wordList }),
  setTargetDuration: (ms) => set({ targetDurationMs: ms }),
  setSelectedModel: (id) => set({ selectedModelId: id }),
  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),

  addSpeaker: (name) =>
    set((state) => {
      const trimmed = name.trim()
      if (!trimmed) return {}
      const sp = newSpeaker(trimmed)
      const isFirst = state.speakers.length === 0
      // If we add the very first speaker mid-listening, start their clock.
      if (isFirst && state.status === 'listening') sp.activeSince = Date.now()
      return {
        speakers: [...state.speakers, sp],
        activeSpeakerId: isFirst ? sp.id : state.activeSpeakerId,
      }
    }),

  removeSpeaker: (id) =>
    set((state) => {
      const speakers = state.speakers.filter((s) => s.id !== id)
      let activeSpeakerId = state.activeSpeakerId
      if (activeSpeakerId === id) {
        activeSpeakerId = speakers[0]?.id ?? null
      }
      return { speakers, activeSpeakerId }
    }),

  setActiveSpeaker: (id) =>
    set((state) => {
      if (id === state.activeSpeakerId) return {}
      const now = Date.now()
      const listening = state.status === 'listening'
      const speakers = state.speakers.map((sp) => {
        if (sp.id === state.activeSpeakerId) return flushSpeaking(sp, now)
        if (sp.id === id) return { ...sp, activeSince: listening ? now : null }
        return sp
      })
      return { speakers, activeSpeakerId: id }
    }),

  addTranscriptLine: (text) =>
    set((state) => {
      if (!state.activeSpeakerId) return {}
      return {
        speakers: state.speakers.map((sp) =>
          sp.id === state.activeSpeakerId
            ? {
                ...sp,
                transcript: [
                  ...sp.transcript,
                  { id: crypto.randomUUID(), text, timestamp: Date.now() },
                ],
                partialText: '',
              }
            : sp
        ),
      }
    }),

  setPartial: (partialText) =>
    set((state) => {
      if (!state.activeSpeakerId) return {}
      return {
        speakers: state.speakers.map((sp) =>
          sp.id === state.activeSpeakerId ? { ...sp, partialText } : sp
        ),
      }
    }),

  applyDetections: (detections) =>
    set((state) => {
      if (detections.length === 0 || !state.activeSpeakerId) return {}
      return {
        speakers: state.speakers.map((sp) => {
          if (sp.id !== state.activeSpeakerId) return sp
          const counts = { ...sp.counts }
          for (const d of detections) counts[d.word] = (counts[d.word] ?? 0) + 1
          return { ...sp, counts, detectionLog: [...sp.detectionLog, ...detections] }
        }),
      }
    }),

  // Add a filler to the effective list. `group` picks the bucket for a single
  // word: 'sound' (always-counted, variant-collapsed) or 'word' (crutch word
  // with context rules). Multi-word entries always become phrases regardless
  // of group. Changes are picked up live by the detector (App syncs config on
  // wordList change) and persisted to localStorage.
  addFiller: (raw, group) =>
    set((state) => {
      const word = raw.toLowerCase().trim().replace(/\s+/g, ' ')
      if (!word) return {}
      const existing = new Set<string>([
        ...state.wordList.soundFillers.map(canonicalFiller),
        ...state.wordList.crutchWords,
        ...state.wordList.crutchPhrases,
      ])
      if (existing.has(word)) return {}
      const isPhrase = word.includes(' ')
      const wl = state.wordList
      let next: WordList
      if (isPhrase) {
        next = { ...wl, crutchPhrases: [...wl.crutchPhrases, word] }
      } else if (group === 'sound') {
        next = { ...wl, soundFillers: [...wl.soundFillers, word] }
      } else {
        next = { ...wl, crutchWords: [...wl.crutchWords, word] }
      }
      return { wordList: next, presetName: 'Custom' }
    }),

  // Remove a filler by label. For sounds the label is canonical, so drop every
  // variant that canonicalizes to it; crutch words / phrases match exactly.
  removeFiller: (raw) =>
    set((state) => {
      const w = raw.toLowerCase().trim()
      const wl = state.wordList
      return {
        wordList: {
          soundFillers: wl.soundFillers.filter(
            (v) => v !== w && canonicalFiller(v) !== w
          ),
          crutchWords: wl.crutchWords.filter((x) => x !== w),
          crutchPhrases: wl.crutchPhrases.filter((x) => x !== w),
        },
        presetName: 'Custom',
      }
    }),

  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),

  addManualDetection: (word) =>
    set((state) => {
      if (!state.activeSpeakerId) return {}
      const canonical = canonicalFiller(word)
      const det: Detection = {
        id: crypto.randomUUID(),
        word: canonical,
        timestamp: Date.now(),
        context: '(added manually)',
        manual: true,
      }
      return {
        speakers: state.speakers.map((sp) => {
          if (sp.id !== state.activeSpeakerId) return sp
          const counts = { ...sp.counts }
          counts[canonical] = (counts[canonical] ?? 0) + 1
          return { ...sp, counts, detectionLog: [...sp.detectionLog, det] }
        }),
      }
    }),

  markSessionStart: () =>
    set((state) => {
      const now = Date.now()
      return {
        // Preserve the original start time when resuming a stopped session so
        // Start acts as "continue the meeting", not "wipe and restart". A
        // fresh meeting is begun explicitly via resetSessionData().
        sessionStartAt: state.sessionStartAt ?? now,
        sessionEndAt: null,
        speakers: state.speakers.map((sp) =>
          sp.id === state.activeSpeakerId ? { ...sp, activeSince: now } : sp
        ),
      }
    }),

  markSessionEnd: () =>
    set((state) => {
      const now = Date.now()
      return {
        sessionEndAt: now,
        speakers: state.speakers.map((sp) =>
          sp.id === state.activeSpeakerId ? flushSpeaking(sp, now) : sp
        ),
      }
    }),

  openReport: () => set({ showReport: true }),
  closeReport: () => set({ showReport: false }),

  // Clear every speaker's live data but keep the roster (names) so a new
  // session can reuse the same lineup.
  resetSessionData: () =>
    set((state) => ({
      speakers: state.speakers.map((sp) => ({
        ...sp,
        counts: {},
        detectionLog: [],
        transcript: [],
        partialText: '',
        speakingMs: 0,
        activeSince: null,
      })),
      sessionStartAt: null,
      sessionEndAt: null,
      showReport: false,
      errorMessage: null,
    })),
    }),
    {
      name: 'ah-counter-config',
      version: 1,
      // Persist ONLY configuration — never speech, transcripts, or the speaker
      // roster. The "audio never leaves the tab" guarantee is unaffected;
      // this just remembers the user's word list and preferences.
      partialize: (s) => ({
        wordList: s.wordList,
        presetName: s.presetName,
        sensitivity: s.sensitivity,
        selectedModelId: s.selectedModelId,
        targetDurationMs: s.targetDurationMs,
      }),
    }
  )
)

// Convenience selector: the currently-active speaker object (or null).
export function selectActiveSpeaker(state: SessionState): Speaker | null {
  return state.speakers.find((s) => s.id === state.activeSpeakerId) ?? null
}
