/**
 * Rule-based filler-word detection.
 *
 * Given an utterance (final Vosk result), returns a list of detections that
 * should be counted. Applies:
 *   - always-count sound fillers ("um", "uh", ...)
 *   - configurable crutch words / phrases
 *   - position rules ("so" only at utterance start; "like" not before to/a/an/number)
 *   - rolling frequency threshold (strict=1, balanced=3, loose=5 within 30 s)
 *
 * The detector is stateful (it holds a rolling candidate log per word), so
 * create one instance per speaker and feed its `process` with each utterance.
 */

export type Sensitivity = 'extra-strict' | 'strict' | 'balanced' | 'loose'

export interface WordList {
  soundFillers: string[]
  crutchWords: string[]
  crutchPhrases: string[] // multi-word, space-separated, lowercase
}

export interface DetectorConfig {
  wordList: WordList
  sensitivity: Sensitivity
  frequencyWindowMs: number
}

export interface Detection {
  id: string
  word: string
  timestamp: number
  context: string
}

export interface Detector {
  process: (utterance: string, timestamp: number) => Detection[]
  updateConfig: (patch: Partial<DetectorConfig>) => void
  reset: () => void
}

const CONTEXT_RADIUS = 4

const SUBJECT_PRONOUNS = new Set(['i', 'we', 'you', 'she', 'he', 'they'])

const normalizeSet = (words: string[]): Set<string> =>
  new Set(words.map((w) => w.toLowerCase().trim()).filter(Boolean))

export function createDetector(initial: DetectorConfig): Detector {
  let config: DetectorConfig = initial
  const candidateLog = new Map<string, number[]>() // word/phrase -> timestamps

  const thresholdFor = (isSoundFiller: boolean): number => {
    if (isSoundFiller) return 1
    switch (config.sensitivity) {
      case 'extra-strict':
        return 1
      case 'strict':
        return 1
      case 'balanced':
        return 3
      case 'loose':
        return 5
    }
  }

  const trimWindow = (word: string, now: number): number[] => {
    const arr = candidateLog.get(word) ?? []
    const cutoff = now - config.frequencyWindowMs
    const kept = arr.filter((t) => t >= cutoff)
    candidateLog.set(word, kept)
    return kept
  }

  const shouldFilterByContext = (
    word: string,
    prev: string | undefined,
    next: string | undefined
  ): boolean => {
    // Extra-strict: count everything. No position/context filtering.
    // Loose is the opposite extreme — also no filtering, because loose relies
    // on the frequency threshold to reject noise instead of rules.
    if (config.sensitivity === 'extra-strict') return false
    if (config.sensitivity === 'loose') return false
    if (word === 'so') {
      // "So" as a legitimate connector is fine mid-utterance.
      // As a filler, it starts a new thought (prev is undefined here since
      // we operate per utterance from Vosk, which segments on pauses).
      return prev !== undefined
    }
    if (word === 'like') {
      // Verb usage: "I like X", "we like Y", "they like Z" — subject pronoun
      // right before is a strong signal this isn't a filler.
      if (prev && SUBJECT_PRONOUNS.has(prev)) return true
      if (!next) return false
      // "like to" (infinitive), "like a/an" (simile), "like 5" (approximation).
      if (['to', 'a', 'an'].includes(next)) return true
      if (/^\d/.test(next)) return true
      return false
    }
    return false
  }

  const process = (utterance: string, timestamp: number): Detection[] => {
    const tokens = utterance
      .toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .split(/\s+/)
      .filter(Boolean)
    if (tokens.length === 0) return []

    const soundSet = normalizeSet(config.wordList.soundFillers)
    const crutchSet = normalizeSet(config.wordList.crutchWords)
    const phrases = config.wordList.crutchPhrases
      .map((p) => p.toLowerCase().trim().split(/\s+/))
      .filter((arr) => arr.length > 0)

    const consumed = new Set<number>()
    const detections: Detection[] = []

    // Multi-word phrases first (greedy, longest not required for v1).
    for (const phraseTokens of phrases) {
      const phrase = phraseTokens.join(' ')
      for (let i = 0; i <= tokens.length - phraseTokens.length; i++) {
        const match = phraseTokens.every((pt, j) => tokens[i + j] === pt)
        if (!match) continue
        const arr = trimWindow(phrase, timestamp)
        arr.push(timestamp)
        candidateLog.set(phrase, arr)
        if (arr.length >= thresholdFor(false)) {
          detections.push({
            id: crypto.randomUUID(),
            word: phrase,
            timestamp,
            context: sliceContext(tokens, i, i + phraseTokens.length),
          })
        }
        for (let j = 0; j < phraseTokens.length; j++) consumed.add(i + j)
      }
    }

    // Single-word tokens.
    for (let i = 0; i < tokens.length; i++) {
      if (consumed.has(i)) continue
      const w = tokens[i]
      const isSound = soundSet.has(w)
      const isCrutch = crutchSet.has(w)
      if (!isSound && !isCrutch) continue

      if (isCrutch && !isSound) {
        const prev = i > 0 ? tokens[i - 1] : undefined
        const next = i < tokens.length - 1 ? tokens[i + 1] : undefined
        if (shouldFilterByContext(w, prev, next)) continue
      }

      const arr = trimWindow(w, timestamp)
      arr.push(timestamp)
      candidateLog.set(w, arr)

      if (arr.length >= thresholdFor(isSound)) {
        detections.push({
          id: crypto.randomUUID(),
          word: w,
          timestamp,
          context: sliceContext(tokens, i, i + 1),
        })
      }
    }

    return detections
  }

  const updateConfig = (patch: Partial<DetectorConfig>): void => {
    config = { ...config, ...patch }
  }

  const reset = (): void => {
    candidateLog.clear()
  }

  return { process, updateConfig, reset }
}

function sliceContext(tokens: string[], hitStart: number, hitEnd: number): string {
  const from = Math.max(0, hitStart - CONTEXT_RADIUS)
  const to = Math.min(tokens.length, hitEnd + CONTEXT_RADIUS)
  return tokens.slice(from, to).join(' ')
}
