import { create } from 'zustand'
import type { Detection, Sensitivity, WordList } from './detection/detector'
import { TOASTMASTERS_CLASSIC } from './detection/presets'

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

  setSpeakerName: (name: string) => void
  setStatus: (status: EngineStatus, errorMessage?: string | null) => void
  setSensitivity: (s: Sensitivity) => void
  setPreset: (name: string, list: WordList) => void

  addTranscriptLine: (text: string) => void
  setPartial: (text: string) => void

  applyDetections: (detections: Detection[]) => void

  resetSession: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  speakerName: '',
  status: 'idle',
  errorMessage: null,

  wordList: TOASTMASTERS_CLASSIC,
  sensitivity: 'balanced',
  presetName: 'Toastmasters Classic',

  transcript: [],
  partialText: '',

  counts: {},
  detectionLog: [],

  setSpeakerName: (name) => set({ speakerName: name }),

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

  resetSession: () =>
    set({
      transcript: [],
      partialText: '',
      counts: {},
      detectionLog: [],
      status: 'idle',
      errorMessage: null,
    }),
}))
