/**
 * Derive session-report stats from raw store data.
 *
 * All inputs are things we already collect during a live session; nothing
 * new needs to be instrumented. `computeReport` is pure — safe to call at
 * render time, no side effects.
 */

import type { Detection } from './detection/detector'
import type { TranscriptLine } from './store'

export interface WordCount {
  word: string
  count: number
}

export interface SessionReport {
  totalFillers: number
  perWord: WordCount[] // sorted descending by count
  topCrutch: string | null
  durationSec: number
  wordsSpoken: number
  wordsPerMin: number
  fillersPerMin: number
  fillerRate: number // fraction: fillers / wordsSpoken
  longestCleanStreakWords: number // approx: max time-gap between fillers × wpm
  trendPct: number // (last-third rate - first-third rate) / first-third rate; negative = improving
  summary: string
}

export interface ReportInput {
  transcript: TranscriptLine[]
  detections: Detection[]
  counts: Record<string, number>
  sessionStartAt: number | null
  sessionEndAt: number | null
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .split(/\s+/)
    .filter(Boolean)

export function computeReport(input: ReportInput): SessionReport {
  const { transcript, detections, counts, sessionStartAt, sessionEndAt } = input

  const totalFillers = Object.values(counts).reduce((a, b) => a + b, 0)
  const perWord: WordCount[] = Object.entries(counts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
  const topCrutch = perWord.length > 0 ? perWord[0].word : null

  const wordsSpoken = transcript.reduce((acc, line) => acc + tokenize(line.text).length, 0)

  const durationMs =
    sessionStartAt !== null && sessionEndAt !== null
      ? Math.max(1000, sessionEndAt - sessionStartAt)
      : Math.max(1000, transcriptDurationMs(transcript))
  const durationSec = Math.round(durationMs / 1000)
  const durationMin = durationMs / 60_000

  const wordsPerMin = durationMin > 0 ? Math.round(wordsSpoken / durationMin) : 0
  const fillersPerMin = durationMin > 0 ? round1(totalFillers / durationMin) : 0
  const fillerRate = wordsSpoken > 0 ? totalFillers / wordsSpoken : 0

  const longestCleanStreakWords = computeLongestCleanStreak(
    detections,
    sessionStartAt,
    sessionEndAt,
    wordsPerMin
  )

  const trendPct = computeTrend(detections, sessionStartAt, sessionEndAt)

  const summary = buildSummary({
    totalFillers,
    topCrutch,
    topCount: perWord[0]?.count ?? 0,
    trendPct,
    fillersPerMin,
  })

  return {
    totalFillers,
    perWord,
    topCrutch,
    durationSec,
    wordsSpoken,
    wordsPerMin,
    fillersPerMin,
    fillerRate,
    longestCleanStreakWords,
    trendPct,
    summary,
  }
}

// --- helpers ---------------------------------------------------------------

function transcriptDurationMs(lines: TranscriptLine[]): number {
  if (lines.length === 0) return 0
  return lines[lines.length - 1].timestamp - lines[0].timestamp
}

function computeLongestCleanStreak(
  detections: Detection[],
  startAt: number | null,
  endAt: number | null,
  wpm: number
): number {
  if (wpm <= 0) return 0
  const bounds = [
    startAt ?? detections[0]?.timestamp ?? 0,
    ...detections.map((d) => d.timestamp),
    endAt ?? detections[detections.length - 1]?.timestamp ?? 0,
  ]
  let maxGapMs = 0
  for (let i = 1; i < bounds.length; i++) {
    const gap = bounds[i] - bounds[i - 1]
    if (gap > maxGapMs) maxGapMs = gap
  }
  return Math.round((maxGapMs / 60_000) * wpm)
}

function computeTrend(
  detections: Detection[],
  startAt: number | null,
  endAt: number | null
): number {
  if (detections.length < 3 || startAt === null || endAt === null) return 0
  const span = endAt - startAt
  if (span <= 0) return 0
  const thirdSize = span / 3
  const firstEnd = startAt + thirdSize
  const lastStart = endAt - thirdSize
  const first = detections.filter((d) => d.timestamp <= firstEnd).length
  const last = detections.filter((d) => d.timestamp >= lastStart).length
  if (first === 0) return last > 0 ? Number.POSITIVE_INFINITY : 0
  return ((last - first) / first) * 100
}

function buildSummary(args: {
  totalFillers: number
  topCrutch: string | null
  topCount: number
  trendPct: number
  fillersPerMin: number
}): string {
  const { totalFillers, topCrutch, topCount, trendPct, fillersPerMin } = args

  if (totalFillers === 0) {
    return 'Zero fillers detected. Elite performance — or the mic was off.'
  }

  const parts: string[] = []

  if (topCrutch) {
    parts.push(`Your most-relied-on crutch was \`${topCrutch}\` — ${topCount} time${topCount === 1 ? '' : 's'}.`)
  }

  if (fillersPerMin >= 1) {
    parts.push(`That's ${fillersPerMin} per minute overall.`)
  }

  if (Number.isFinite(trendPct) && Math.abs(trendPct) >= 20) {
    if (trendPct < 0) {
      parts.push(`Your rate dropped ${Math.round(-trendPct)}% by the end — you warmed up.`)
    } else {
      parts.push(`Your rate rose ${Math.round(trendPct)}% by the end — fatigue setting in.`)
    }
  }

  return parts.join(' ')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
