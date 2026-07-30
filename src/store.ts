import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Detection, FillerKind, Sensitivity, WordList } from './detection/detector'
import { canonicalFiller } from './detection/detector'
import { TOASTMASTERS_CLASSIC } from './detection/presets'

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

// One bucket per speaker. Counts are split by kind: sound fillers (from
// recognizer B) and crutch words (from transcript rules on recognizer A).
export interface Speaker {
  id: string
  name: string
  soundCounts: Record<string, number>
  crutchCounts: Record<string, number>
  detectionLog: Detection[] // both kinds, each tagged
  transcript: TranscriptLine[]
  partialText: string
  speakingMs: number
  activeSince: number | null
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

  targetDurationMs: number | null
  loadingMessage: string | null

  setStatus: (status: EngineStatus, errorMessage?: string | null) => void
  setSensitivity: (s: Sensitivity) => void
  setPreset: (name: string, list: WordList) => void
  setTargetDuration: (ms: number | null) => void
  setLoadingMessage: (msg: string | null) => void

  addFiller: (word: string, group: FillerGroup) => void
  removeFiller: (word: string) => void
  openSettings: () => void
  closeSettings: () => void

  addSpeaker: (name: string) => void
  removeSpeaker: (id: string) => void
  setActiveSpeaker: (id: string) => void

  addTranscriptLine: (text: string) => void
  setPartial: (text: string) => void
  applyCrutchDetections: (detections: Detection[]) => void
  applySoundDetections: (words: string[]) => void
  addManualDetection: (word: string, kind: FillerKind) => void
  decrementDetection: (word: string, kind: FillerKind) => void
  clearDetection: (word: string, kind: FillerKind) => void

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
    soundCounts: {},
    crutchCounts: {},
    detectionLog: [],
    transcript: [],
    partialText: '',
    speakingMs: 0,
    activeSince: null,
  }
}

function flushSpeaking(sp: Speaker, now: number): Speaker {
  if (sp.activeSince == null) return sp
  return { ...sp, speakingMs: sp.speakingMs + (now - sp.activeSince), activeSince: null }
}

// Update the active speaker via a mapper; no-op if none active.
function mapActive(
  state: SessionState,
  fn: (sp: Speaker) => Speaker
): Partial<SessionState> {
  if (!state.activeSpeakerId) return {}
  return {
    speakers: state.speakers.map((sp) =>
      sp.id === state.activeSpeakerId ? fn(sp) : sp
    ),
  }
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
      loadingMessage: null,

      setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
      setSensitivity: (sensitivity) => set({ sensitivity }),
      setPreset: (presetName, wordList) => set({ presetName, wordList }),
      setTargetDuration: (ms) => set({ targetDurationMs: ms }),
      setLoadingMessage: (loadingMessage) => set({ loadingMessage }),

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
          if (isPhrase) next = { ...wl, crutchPhrases: [...wl.crutchPhrases, word] }
          else if (group === 'sound') next = { ...wl, soundFillers: [...wl.soundFillers, word] }
          else next = { ...wl, crutchWords: [...wl.crutchWords, word] }
          return { wordList: next, presetName: 'Custom' }
        }),

      removeFiller: (raw) =>
        set((state) => {
          const w = raw.toLowerCase().trim()
          const wl = state.wordList
          return {
            wordList: {
              soundFillers: wl.soundFillers.filter((v) => v !== w && canonicalFiller(v) !== w),
              crutchWords: wl.crutchWords.filter((x) => x !== w),
              crutchPhrases: wl.crutchPhrases.filter((x) => x !== w),
            },
            presetName: 'Custom',
          }
        }),

      openSettings: () => set({ showSettings: true }),
      closeSettings: () => set({ showSettings: false }),

      addSpeaker: (name) =>
        set((state) => {
          const trimmed = name.trim()
          if (!trimmed) return {}
          const sp = newSpeaker(trimmed)
          const isFirst = state.speakers.length === 0
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
          if (activeSpeakerId === id) activeSpeakerId = speakers[0]?.id ?? null
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
        set((state) =>
          mapActive(state, (sp) => ({
            ...sp,
            transcript: [
              ...sp.transcript,
              { id: crypto.randomUUID(), text, timestamp: Date.now() },
            ],
            partialText: '',
          }))
        ),

      setPartial: (partialText) =>
        set((state) => mapActive(state, (sp) => ({ ...sp, partialText }))),

      applyCrutchDetections: (detections) =>
        set((state) => {
          if (detections.length === 0) return {}
          return mapActive(state, (sp) => {
            const crutchCounts = { ...sp.crutchCounts }
            const tagged = detections.map((d) => ({ ...d, kind: 'crutch' as const }))
            for (const d of tagged) crutchCounts[d.word] = (crutchCounts[d.word] ?? 0) + 1
            return { ...sp, crutchCounts, detectionLog: [...sp.detectionLog, ...tagged] }
          })
        }),

      applySoundDetections: (words) =>
        set((state) => {
          if (words.length === 0) return {}
          const now = Date.now()
          return mapActive(state, (sp) => {
            const soundCounts = { ...sp.soundCounts }
            const dets: Detection[] = words.map((w) => {
              soundCounts[w] = (soundCounts[w] ?? 0) + 1
              return {
                id: crypto.randomUUID(),
                word: w,
                timestamp: now,
                context: '',
                kind: 'sound' as const,
              }
            })
            return { ...sp, soundCounts, detectionLog: [...sp.detectionLog, ...dets] }
          })
        }),

      addManualDetection: (word, kind) =>
        set((state) => {
          const canonical = kind === 'sound' ? canonicalFiller(word) : word
          const det: Detection = {
            id: crypto.randomUUID(),
            word: canonical,
            timestamp: Date.now(),
            context: '(added manually)',
            manual: true,
            kind,
          }
          return mapActive(state, (sp) => {
            const key = kind === 'sound' ? 'soundCounts' : 'crutchCounts'
            const counts = { ...sp[key] }
            counts[canonical] = (counts[canonical] ?? 0) + 1
            return { ...sp, [key]: counts, detectionLog: [...sp.detectionLog, det] }
          })
        }),

      decrementDetection: (word, kind) =>
        set((state) =>
          mapActive(state, (sp) => {
            const key = kind === 'sound' ? 'soundCounts' : 'crutchCounts'
            const cur = sp[key][word] ?? 0
            if (cur <= 0) return sp
            const counts = { ...sp[key] }
            if (cur - 1 <= 0) delete counts[word]
            else counts[word] = cur - 1
            const log = [...sp.detectionLog]
            for (let i = log.length - 1; i >= 0; i--) {
              if (log[i].word === word && log[i].kind === kind) {
                log.splice(i, 1)
                break
              }
            }
            return { ...sp, [key]: counts, detectionLog: log }
          })
        ),

      clearDetection: (word, kind) =>
        set((state) =>
          mapActive(state, (sp) => {
            const key = kind === 'sound' ? 'soundCounts' : 'crutchCounts'
            if (!(word in sp[key])) return sp
            const counts = { ...sp[key] }
            delete counts[word]
            return {
              ...sp,
              [key]: counts,
              detectionLog: sp.detectionLog.filter(
                (d) => !(d.word === word && d.kind === kind)
              ),
            }
          })
        ),

      markSessionStart: () =>
        set((state) => {
          const now = Date.now()
          return {
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

      resetSessionData: () =>
        set((state) => ({
          speakers: state.speakers.map((sp) => ({
            ...sp,
            soundCounts: {},
            crutchCounts: {},
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
      version: 2,
      // Persist ONLY configuration — never speech, transcripts, or the roster.
      partialize: (s) => ({
        wordList: s.wordList,
        presetName: s.presetName,
        sensitivity: s.sensitivity,
        targetDurationMs: s.targetDurationMs,
      }),
    }
  )
)

export function selectActiveSpeaker(state: SessionState): Speaker | null {
  return state.speakers.find((s) => s.id === state.activeSpeakerId) ?? null
}

// Total fillers (both kinds) for a speaker — used for roster chips.
export function speakerTotal(sp: Speaker): number {
  const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)
  return sum(sp.soundCounts) + sum(sp.crutchCounts)
}
