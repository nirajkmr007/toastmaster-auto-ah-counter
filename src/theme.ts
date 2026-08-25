/**
 * Theme selection. The palettes themselves live in index.css, keyed on the
 * `data-theme` attribute of <html>; this module only decides which key is set.
 *
 * Kept out of the component tree so index.html can apply the saved theme
 * before React mounts — otherwise a light-theme user gets a black flash on
 * every load.
 */

export type ThemeId = 'light' | 'dark' | 'warm'

export interface ThemeOption {
  id: ThemeId
  label: string
  /** Glyph for the header button — filled circle reads as "most ink". */
  glyph: string
}

export const THEMES: ThemeOption[] = [
  { id: 'light', label: 'Light', glyph: '○' },
  { id: 'dark', label: 'Dark', glyph: '●' },
  { id: 'warm', label: 'Warm', glyph: '◐' },
]

export const DEFAULT_THEME: ThemeId = 'dark'

/**
 * Accept whatever was persisted and return something that exists. Covers the
 * short-lived 'dim' theme (a mid slate) that 'warm' replaced, so anyone who had
 * it selected lands on its successor rather than silently reverting to dark.
 */
export function normalizeTheme(id: unknown): ThemeId {
  if (id === 'dim') return 'warm'
  return THEMES.some((t) => t.id === id) ? (id as ThemeId) : DEFAULT_THEME
}

/** localStorage key of the persisted zustand config (see store.ts). */
export const CONFIG_KEY = 'ah-counter-config'

export function getTheme(id: string): ThemeOption {
  const wanted = normalizeTheme(id)
  return THEMES.find((t) => t.id === wanted) ?? THEMES[0]
}

/** The next theme in the cycle — light → dark → warm → light. */
export function nextTheme(id: ThemeId): ThemeId {
  const i = THEMES.findIndex((t) => t.id === normalizeTheme(id))
  return THEMES[(i + 1) % THEMES.length].id
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = normalizeTheme(id)
}
