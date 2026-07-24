import { create } from 'zustand'
import type { Detection, Sensitivity, WordList } from './detection/detector'
import { TOASTMASTERS_CLASSIC } from './detection/presets'
import { DEFAULT_MODEL_ID } from './audio/models'

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

export interface SessionState {
  speakerName: string
  status: EngineStatus
  errorMessage: string | null

  wordList: WordList
  sensitivity: Sensitivity
  presetName: string

  transcript: TranscriptLine[]
  partialText: string

  counts: Record<string, number>
  detectionLog: Detection[] // full log for the session (used for animation trigger + scoring)

  sessionStartAt: number | null
  sessionEndAt: number | null
  showReport: boolean

  targetDurationMs: number | null // null = no auto-stop

  selectedModelId: string
  loadingMessage: string | null

  setSpeakerName: (name: string) => void
  setTargetDuration: (ms: number | null) => void
  setSelectedModel: (id: string) => void
  setLoadingMessage: (msg: string | null) => void
  setStatus: (status: EngineStatus, errorMessage?: string | null) => void
  setSensitivity: (s: Sensitivity) => void
  setPreset: (name: string, list: WordList) => void

  addTranscriptLine: (text: string) => void
  setPartial: (text: string) => void

  applyDetections: (detections: Detection[]) => void

  markSessionStart: () => void
  markSessionEnd: () => void
  openReport: () => void
  closeReport: () => void
  startPracticeMode: (word: string) => void

  resetSession: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  speakerName: '',
  status: 'idle',
  errorMessage: null,

  wordList: TOASTMASTERS_CLASSIC,
  sensitivity: 'extra-strict',
  presetName: 'Toastmasters Classic',

  transcript: [],
  partialText: '',

  counts: {},
  detectionLog: [],

  sessionStartAt: null,
  sessionEndAt: null,
  showReport: false,

  targetDurationMs: null,

  selectedModelId: DEFAULT_MODEL_ID,
  loadingMessage: null,

  setSpeakerName: (name) => set({ speakerName: name }),

  setTargetDuration: (ms) => set({ targetDurationMs: ms }),

  setSelectedModel: (id) => set({ selectedModelId: id }),

  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),

  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),

  setSensitivity: (sensitivity) => set({ sensitivity }),

  setPreset: (presetName, wordList) => set({ presetName, wordList }),

  addTranscriptLine: (text) =>
    set((state) => ({
      transcript: [
        ...state.transcript,
        { id: crypto.randomUUID(), text, timestamp: Date.now() },
      ],
      partialText: '',
    })),

  setPartial: (partialText) => set({ partialText }),

  applyDetections: (detections) =>
    set((state) => {
      if (detections.length === 0) return {}
      const nextCounts = { ...state.counts }
      for (const d of detections) {
        nextCounts[d.word] = (nextCounts[d.word] ?? 0) + 1
      }
      return {
        counts: nextCounts,
        detectionLog: [...state.detectionLog, ...detections],
      }
    }),

  markSessionStart: () =>
    set({ sessionStartAt: Date.now(), sessionEndAt: null }),

  markSessionEnd: () => set({ sessionEndAt: Date.now() }),

  openReport: () => set({ showReport: true }),

  closeReport: () => set({ showReport: false }),

  startPracticeMode: (word) =>
    set((state) => {
      const isPhrase = word.includes(' ')
      const focused: WordList = {
        soundFillers: [],
        crutchWords: isPhrase ? [] : [word],
        crutchPhrases: isPhrase ? [word] : [],
      }
      return {
        wordList: focused,
        sensitivity: 'extra-strict' as const,
        presetName: `Practice: ${word}`,
        transcript: [],
        partialText: '',
        counts: {},
        detectionLog: [],
        sessionStartAt: null,
        sessionEndAt: null,
        showReport: false,
        status: 'ready' as const,
        errorMessage: null,
        // keep speakerName so they don't have to retype it
        speakerName: state.speakerName,
      }
    }),

  resetSession: () =>
    set({
      transcript: [],
      partialText: '',
      counts: {},
      detectionLog: [],
      sessionStartAt: null,
      sessionEndAt: null,
      showReport: false,
      status: 'idle',
      errorMessage: null,
    }),
}))
