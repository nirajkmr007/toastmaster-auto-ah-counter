/**
 * Portable settings file — export / import of configuration only.
 *
 * The app deliberately stores nothing server-side and keeps speech in memory
 * for the session only. That's the right default, but it means a regular
 * ah-counter loses their tuned filler list the moment they clear the browser or
 * pick up a different laptop. A file they own solves that without weakening the
 * privacy stance: it carries settings, never speech, transcripts, counts or the
 * speaker roster.
 *
 * The parser here is deliberately paranoid. An imported file is untrusted input
 * — it may be hand-edited, truncated, from a newer version, or simply the wrong
 * JSON file entirely. Every field is type-checked, range-clamped and length-
 * capped, unknown keys are ignored, and anything invalid falls back to the
 * current value rather than rejecting the whole file.
 */

import type { Sensitivity, WordList } from './detection/detector'
import { normalizeBlockedWord } from './detection/profanity'
import { MODELS } from './audio/models'
import { THEMES, normalizeTheme, type ThemeId } from './theme'

export const SETTINGS_FILE_VERSION = 1
const FILE_KIND = 'toastmasters-ah-counter-settings'

/** Everything a settings file may carry. All optional — partial files import. */
export interface PortableSettings {
  wordList?: WordList
  presetName?: string
  sensitivity?: Sensitivity
  targetDurationMs?: number | null
  hardStopMs?: number
  extraBlockedWords?: string[]
  maskMildWords?: boolean
  modelId?: string
  theme?: ThemeId
  transcriptCollapsed?: boolean
}

export interface ParseResult {
  settings: PortableSettings | null
  /** Human-readable reason when settings is null. */
  error: string | null
  /** Non-fatal issues: fields dropped or clamped. */
  warnings: string[]
}

// ── limits ────────────────────────────────────────────────────────────────
const MAX_FILE_BYTES = 512 * 1024
const MAX_WORD_LEN = 40
const MAX_LIST_ITEMS = 300
const MAX_NAME_LEN = 60
const MIN_HARD_STOP = 60_000 // 1 min
const MAX_HARD_STOP = 4 * 60 * 60_000 // 4 h

const SENSITIVITIES: Sensitivity[] = [
  'extra-strict',
  'strict',
  'balanced',
  'loose',
]

function cleanWords(
  value: unknown,
  label: string,
  warnings: string[]
): string[] | null {
  if (!Array.isArray(value)) {
    warnings.push(`${label}: not a list — ignored`)
    return null
  }
  const out: string[] = []
  const seen = new Set<string>()
  let dropped = 0
  for (const raw of value) {
    if (typeof raw !== 'string') {
      dropped++
      continue
    }
    const w = raw.trim().toLowerCase().slice(0, MAX_WORD_LEN)
    if (!w || seen.has(w)) {
      dropped++
      continue
    }
    if (out.length >= MAX_LIST_ITEMS) {
      dropped++
      continue
    }
    seen.add(w)
    out.push(w)
  }
  if (dropped > 0) warnings.push(`${label}: skipped ${dropped} invalid entr${dropped === 1 ? 'y' : 'ies'}`)
  return out
}

function clampMs(
  value: unknown,
  min: number,
  max: number,
  label: string,
  warnings: string[]
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    warnings.push(`${label}: not a number — ignored`)
    return null
  }
  const clamped = Math.min(max, Math.max(min, Math.round(value)))
  if (clamped !== Math.round(value)) warnings.push(`${label}: clamped to a supported range`)
  return clamped
}

/** Build the file body from the current configuration. */
export function buildSettingsFile(s: Required<PortableSettings>): string {
  return JSON.stringify(
    {
      kind: FILE_KIND,
      version: SETTINGS_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      note: 'Settings only. Contains no speech, transcripts, counts or speaker names.',
      settings: {
        wordList: s.wordList,
        presetName: s.presetName,
        sensitivity: s.sensitivity,
        targetDurationMs: s.targetDurationMs,
        hardStopMs: s.hardStopMs,
        extraBlockedWords: s.extraBlockedWords,
        maskMildWords: s.maskMildWords,
        modelId: s.modelId,
        theme: s.theme,
        transcriptCollapsed: s.transcriptCollapsed,
      },
    },
    null,
    2
  )
}

export function parseSettingsFile(text: string): ParseResult {
  const warnings: string[] = []

  if (text.length > MAX_FILE_BYTES) {
    return { settings: null, error: 'That file is too large to be a settings file.', warnings }
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { settings: null, error: "That file isn't valid JSON.", warnings }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { settings: null, error: 'That file has an unexpected shape.', warnings }
  }

  const doc = raw as Record<string, unknown>
  if (doc.kind !== FILE_KIND) {
    return {
      settings: null,
      error: "That doesn't look like an ah-counter settings file.",
      warnings,
    }
  }
  if (typeof doc.version === 'number' && doc.version > SETTINGS_FILE_VERSION) {
    warnings.push(
      `File is version ${doc.version}; this app understands ${SETTINGS_FILE_VERSION}. Unknown fields ignored.`
    )
  }
  const body = doc.settings
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { settings: null, error: 'The file has no settings section.', warnings }
  }
  const src = body as Record<string, unknown>
  const out: PortableSettings = {}

  // Word list — each group cleaned independently, so one bad group doesn't
  // discard the rest.
  if (src.wordList !== undefined) {
    const wl = src.wordList
    if (typeof wl === 'object' && wl !== null && !Array.isArray(wl)) {
      const g = wl as Record<string, unknown>
      const soundFillers = cleanWords(g.soundFillers, 'Sound fillers', warnings)
      const crutchWords = cleanWords(g.crutchWords, 'Crutch words', warnings)
      const crutchPhrases = cleanWords(g.crutchPhrases, 'Crutch phrases', warnings)
      if (soundFillers && crutchWords && crutchPhrases) {
        out.wordList = { soundFillers, crutchWords, crutchPhrases }
      } else {
        warnings.push('Filler list was incomplete — kept the current one')
      }
    } else {
      warnings.push('Filler list: unexpected shape — ignored')
    }
  }

  if (typeof src.presetName === 'string' && src.presetName.trim()) {
    out.presetName = src.presetName.trim().slice(0, MAX_NAME_LEN)
  }

  if (src.sensitivity !== undefined) {
    if (SENSITIVITIES.includes(src.sensitivity as Sensitivity)) {
      out.sensitivity = src.sensitivity as Sensitivity
    } else {
      warnings.push('Sensitivity: unrecognised value — ignored')
    }
  }

  if (src.hardStopMs !== undefined) {
    const v = clampMs(src.hardStopMs, MIN_HARD_STOP, MAX_HARD_STOP, 'Auto-stop', warnings)
    if (v !== null) out.hardStopMs = v
  }

  if (src.targetDurationMs !== undefined) {
    if (src.targetDurationMs === null) {
      out.targetDurationMs = null
    } else {
      const cap = out.hardStopMs ?? MAX_HARD_STOP
      const v = clampMs(src.targetDurationMs, 0, cap, 'Speech length', warnings)
      out.targetDurationMs = v === null || v === 0 ? null : v
    }
  }

  if (src.extraBlockedWords !== undefined) {
    const list = cleanWords(src.extraBlockedWords, 'Masked words', warnings)
    if (list) out.extraBlockedWords = list.map(normalizeBlockedWord).filter(Boolean)
  }

  if (typeof src.maskMildWords === 'boolean') out.maskMildWords = src.maskMildWords
  if (typeof src.transcriptCollapsed === 'boolean') {
    out.transcriptCollapsed = src.transcriptCollapsed
  }

  if (src.modelId !== undefined) {
    if (MODELS.some((m) => m.id === src.modelId)) {
      out.modelId = src.modelId as string
    } else {
      warnings.push('Speech model: not available in this build — kept the current one')
    }
  }

  if (src.theme !== undefined) {
    const t = normalizeTheme(src.theme)
    if (THEMES.some((x) => x.id === t)) out.theme = t
  }

  if (Object.keys(out).length === 0) {
    return {
      settings: null,
      error: 'Nothing in that file could be applied.',
      warnings,
    }
  }
  return { settings: out, error: null, warnings }
}

export function settingsFileName(): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `ah-counter-settings-${stamp}.json`
}
