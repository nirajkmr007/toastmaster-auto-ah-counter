/**
 * Transcript profanity masking.
 *
 * Why this exists: recognizer A runs the model's full open vocabulary, so a
 * nonverbal burst ("ahh", a throat clear, a plosive into the mic) sometimes
 * gets decoded as a short profane word. Nobody said it, but it lands in the
 * transcript — and this tool is used in corporate meetings, on a shared
 * screen, in an exported report.
 *
 * Two things make masking the right layer for the fix:
 *   1. We can't remove words from recognizer A's vocabulary without replacing
 *      it with a fixed grammar, which would destroy open transcription.
 *   2. Recognizer B — which does the actual sound-filler counting — is
 *      grammar-limited to the filler list, so it can never emit profanity.
 *      Masking A's text therefore costs us nothing in counting accuracy.
 *
 * Masking is token-preserving: one blocked token becomes one MASK token, so
 * crutch-word highlight positions stay aligned with the displayed line.
 *
 * Matching is whole-token only, so "class", "assume", "passage" and friends
 * are never touched (no Scunthorpe problem).
 */

export const MASK = '***'

/**
 * Built-in blocked list: strong English profanity in the spellings a US English
 * model actually emits. Deliberately excludes mild words that carry real
 * meaning in normal speech ("damn", "hell", "crap") — masking those would
 * mangle legitimate transcripts.
 *
 * This list is intentionally NOT surfaced in the UI. It's a filter, not a
 * feature: printing 40 profanities into a settings panel that gets opened on a
 * shared screen in a corporate meeting defeats the purpose of having it. Users
 * add their own terms on top of it instead (see `extraBlockedWords` in the
 * store) and only ever see what they added themselves.
 */
const DEFAULT_BLOCKED_WORDS: string[] = [
  'fuck',
  'fucks',
  'fucked',
  'fucking',
  'fucker',
  'fuckers',
  'motherfucker',
  'motherfuckers',
  'motherfucking',
  'shit',
  'shits',
  'shitty',
  'shitting',
  'bullshit',
  'ass',
  'asses',
  'asshole',
  'assholes',
  'jackass',
  'arse',
  'arsehole',
  'bitch',
  'bitches',
  'bitching',
  'bastard',
  'bastards',
  'dick',
  'dickhead',
  'cock',
  'prick',
  'cunt',
  'pussy',
  'twat',
  'wanker',
  'bollocks',
  'whore',
  'slut',
  'piss',
  'pissed',
  'pissing',
]

/** Normalize a user-entered blocked word: lowercase, letters/digits only. */
export function normalizeBlockedWord(word: string): string {
  return word.trim().toLowerCase().replace(/[^a-z0-9'-]/g, '')
}

/**
 * Replace every blocked token in `text` with MASK, preserving token count,
 * spacing and surrounding punctuation.
 */
export function maskProfanity(text: string, blocked: Set<string>): string {
  if (!text || blocked.size === 0) return text

  // Split on whitespace but keep the separators so spacing survives.
  return text
    .split(/(\s+)/)
    .map((tok) => {
      if (!tok || /^\s+$/.test(tok)) return tok
      // Peel leading/trailing punctuation off the word core.
      const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(tok)
      if (!m) return tok
      const [, pre, core, post] = m
      if (!core) return tok
      return blocked.has(core.toLowerCase()) ? `${pre}${MASK}${post}` : tok
    })
    .join('')
}

/** How many words ship built in — safe to show, unlike the words themselves. */
export const DEFAULT_BLOCKED_COUNT = DEFAULT_BLOCKED_WORDS.length

/**
 * Effective blocked set: the built-in list plus whatever the user added.
 * The built-ins are always on; there's no supported way to list or clear them.
 */
export function buildBlockedSet(extraWords: string[] = []): Set<string> {
  const set = new Set(DEFAULT_BLOCKED_WORDS)
  for (const w of extraWords) {
    const n = normalizeBlockedWord(w)
    if (n) set.add(n)
  }
  return set
}
