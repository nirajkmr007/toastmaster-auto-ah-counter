/**
 * Derive report stats from per-speaker session data. Pure — safe at render.
 */

import type { Speaker } from './store'

export interface WordCount {
  word: string
  count: number
}

export interface SpeakerReport {
  id: string
  name: string
  totalFillers: number
  manualCount: number
  perWord: WordCount[] // desc by count
  topCrutch: string | null
  speakingSec: number
  wordsSpoken: number
  fillersPerMin: number
  summary: string
}

export interface OverviewReport {
  speakerCount: number
  totalFillers: number
  sessionSec: number
  cleanestName: string | null // fewest fillers/min among speakers who spoke
  mostName: string | null // most total fillers
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .split(/\s+/)
    .filter(Boolean)

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function computeSpeakerReport(sp: Speaker): SpeakerReport {
  const totalFillers = Object.values(sp.counts).reduce((a, b) => a + b, 0)
  const perWord = Object.entries(sp.counts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
  const topCrutch = perWord[0]?.word ?? null
  const manualCount = sp.detectionLog.filter((d) => d.manual).length

  const wordsSpoken = sp.transcript.reduce(
    (acc, l) => acc + tokenize(l.text).length,
    0
  )
  const speakingSec = Math.round(sp.speakingMs / 1000)
  const minutes = sp.speakingMs / 60_000
  const fillersPerMin = minutes > 0 ? round1(totalFillers / minutes) : 0

  return {
    id: sp.id,
    name: sp.name,
    totalFillers,
    manualCount,
    perWord,
    topCrutch,
    speakingSec,
    wordsSpoken,
    fillersPerMin,
    summary: buildSummary(sp.name, totalFillers, topCrutch, perWord[0]?.count ?? 0, fillersPerMin),
  }
}

export function computeOverview(
  speakers: Speaker[],
  sessionStartAt: number | null,
  sessionEndAt: number | null
): OverviewReport {
  const reports = speakers.map(computeSpeakerReport)
  const totalFillers = reports.reduce((a, r) => a + r.totalFillers, 0)

  const sessionSec =
    sessionStartAt != null && sessionEndAt != null
      ? Math.round((sessionEndAt - sessionStartAt) / 1000)
      : 0

  // Cleanest = lowest fillers/min among speakers who actually spoke.
  const spoke = reports.filter((r) => r.speakingSec > 2)
  let cleanestName: string | null = null
  let mostName: string | null = null
  if (spoke.length > 0) {
    cleanestName = spoke.reduce((a, b) => (b.fillersPerMin < a.fillersPerMin ? b : a)).name
  }
  if (reports.length > 0) {
    const most = reports.reduce((a, b) => (b.totalFillers > a.totalFillers ? b : a))
    if (most.totalFillers > 0) mostName = most.name
  }

  return {
    speakerCount: speakers.length,
    totalFillers,
    sessionSec,
    cleanestName,
    mostName,
  }
}

function buildSummary(
  name: string,
  total: number,
  topCrutch: string | null,
  topCount: number,
  fillersPerMin: number
): string {
  if (total === 0) return `${name} — no fillers detected. Clean run.`
  const parts: string[] = []
  if (topCrutch) parts.push(`Most-used: ${topCrutch} (${topCount}×).`)
  if (fillersPerMin >= 1) parts.push(`${fillersPerMin}/min.`)
  return parts.join(' ')
}
