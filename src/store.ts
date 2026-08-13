import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Detection, FillerKind, Sensitivity, WordList } from './detection/detector'
import { canonicalFiller } from './detection/detector'
import { TOASTMASTERS_CLASSIC } from './detection/presets'
import { normalizeBlockedWord } from './detection/profanity'

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

  // User-added words to mask, ON TOP of the built-in profanity list in
  // detection/profanity.ts. Only these are shown in the UI — the built-ins are
  // deliberately never listed.
  extraBlockedWords: string[]

  speakers: Speaker[]
  activeSpeakerId: string | null

  sessionStartAt: number | null
  sessionEndAt: number | null
  showReport: boolean
  showSettings: boolean
  showTour: boolean

  targetDurationMs: number | null
  hardStopMs: number // safety cap: auto-stop listening after this long
  loadingMessage: string | null

  setStatus: (status: EngineStatus, errorMessage?: string | null) => void
  setSensitivity: (s: Sensitivity) => void
  setPreset: (name: string, list: WordList) => void
  setTargetDuration: (ms: number | null) => void
  setHardStop: (ms: number) => void
  addBlockedWord: (word: string) => void
  removeBlockedWord: (word: string) => void
  setLoadingMessage: (msg: string | null) => void

  addFiller: (word: string, group: FillerGroup) => void
  removeFiller: (word: string) => void
  openSettings: () => void
  closeSettings: () => void
  openTour: () => void
  closeTour: () => void

  addSpeaker: (name: string) => void
  removeSpeaker: (id: string) => void
  setActiveSpeaker: (id: string) => void

  // Add a final transcript line together with the crutch detections found in
  // it. Detections are linked to the line so the transcript can highlight the
  // exact words and remove a specific one on click.
  addTranscriptWithCrutch: (text: string, detections: Detection[]) => void
  setPartial: (text: string) => void
  applySoundDetections: (words: string[]) => void
  addManualDetection: (word: string, kind: FillerKind) => void
  decrementDetection: (word: string, kind: FillerKind) => void
  clearDetection: (word: string, kind: FillerKind) => void
  removeDetectionById: (id: string) => void

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
      extraBlockedWords: [],

      speakers: [],
      activeSpeakerId: null,

      sessionStartAt: null,
      sessionEndAt: null,
      showReport: false,
      showSettings: false,
      showTour: false,

      targetDurationMs: null,
      hardStopMs: 30 * 60_000, // 30 minutes
      loadingMessage: null,

      setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
      setSensitivity: (sensitivity) => set({ sensitivity }),
      setPreset: (presetName, wordList) => set({ presetName, wordList }),
      setTargetDuration: (ms) => set({ targetDurationMs: ms }),
      // Changing the hard stop clamps the per-speech length so it can never
      // exceed the cap.
      setHardStop: (ms) =>
        set((state) => ({
          hardStopMs: ms,
          targetDurationMs:
            state.targetDurationMs != null
              ? Math.min(state.targetDurationMs, ms)
              : null,
        })),
      setLoadingMessage: (loadingMessage) => set({ loadingMessage }),

      addBlockedWord: (word) => {
        const w = normalizeBlockedWord(word)
        if (!w) return
        set((state) =>
          state.extraBlockedWords.includes(w)
            ? state
            : { extraBlockedWords: [...state.extraBlockedWords, w] }
        )
      },
      removeBlockedWord: (word) => {
        const w = normalizeBlockedWord(word)
        set((state) => ({
          extraBlockedWords: state.extraBlockedWords.filter((x) => x !== w),
        }))
      },

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
      openTour: () => set({ showTour: true }),
      closeTour: () => set({ showTour: false }),

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

      addTranscriptWithCrutch: (text, detections) =>
        set((state) => {
          const line = { id: crypto.randomUUID(), text, timestamp: Date.now() }
          const tagged = detections.map((d) => ({
            ...d,
            kind: 'crutch' as const,
            lineId: line.id,
          }))
          return mapActive(state, (sp) => {
            const crutchCounts = { ...sp.crutchCounts }
            for (const d of tagged) crutchCounts[d.word] = (crutchCounts[d.word] ?? 0) + 1
            return {
              ...sp,
              transcript: [...sp.transcript, line],
              crutchCounts,
              detectionLog: [...sp.detectionLog, ...tagged],
              partialText: '',
            }
          })
        }),

      setPartial: (partialText) =>
        set((state) => mapActive(state, (sp) => ({ ...sp, partialText }))),

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

      // Remove one specific detection (used by click-to-dismiss in the
      // transcript). Decrements its own count and drops the log entry.
      removeDetectionById: (id) =>
        set((state) =>
          mapActive(state, (sp) => {
            const det = sp.detectionLog.find((d) => d.id === id)
            if (!det) return sp
            const key = det.kind === 'sound' ? 'soundCounts' : 'crutchCounts'
            const counts = { ...sp[key] }
            const cur = counts[det.word] ?? 0
            if (cur <= 1) delete counts[det.word]
            else counts[det.word] = cur - 1
            return {
              ...sp,
              [key]: counts,
              detectionLog: sp.detectionLog.filter((d) => d.id !== id),
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
      version: 3,
      // Persist ONLY configuration — never speech, transcripts, or the roster.
      partialize: (s) => ({
        wordList: s.wordList,
        presetName: s.presetName,
        sensitivity: s.sensitivity,
        targetDurationMs: s.targetDurationMs,
        hardStopMs: s.hardStopMs,
        extraBlockedWords: s.extraBlockedWords,
      }),
      // v3 dropped the old `blockedWords` key, which stored the built-in
      // profanity list in localStorage. The built-ins now live in code only.
      migrate: (persisted, version) => {
        const s = { ...(persisted as Record<string, unknown>) }
        if (version < 3) delete s.blockedWords
        // Partial by design — persist merges this over the default state.
        return s as unknown as SessionState
      },
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
