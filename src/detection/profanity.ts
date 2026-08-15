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
 * ── How this list was built ────────────────────────────────────────────────
 *
 * Every entry below was checked against the actual vocabularies of both
 * shipped models — the symbol tables inside `graph/Gr.fst` of
 * `vosk-model-small-en-us-0.15` (152,217 words) and
 * `vosk-model-small-en-in-0.4` (72,551 words). A word no model has a symbol
 * for can never be emitted, so listing it would be theatre; terms like "kike"
 * and "wetback" are in neither vocabulary and are therefore absent here.
 *
 * The list is the UNION across models, so some entries are inert for one of
 * them: `arsehole`, `blowjob`, `cocksucker`, `lund` and `randi` exist only in
 * the en-IN vocabulary, and 62 of the entries below can't be emitted by en-IN.
 * Inert entries cost nothing — a word the model can't say needs no masking.
 *
 * The two Hindi terms are there because en-IN carries them: `lund` (penis) and
 * `randi` (prostitute). Notably, the harsher Hindi profanity — chutiya,
 * madarchod, bhenchod, gaandu and similar — is absent from the en-IN
 * vocabulary entirely, so it cannot be produced at all.
 *
 * Re-run `scripts/verify-model-vocab.py` whenever a model is added or swapped.
 *
 * Two tiers, because "offensive" and "vulgar" need different treatment:
 *
 *   STRONG — always masked. Profanity, explicit sexual/anatomical terms, and
 *   slurs (racial, ethnic, homophobic, ableist). No legitimate reading that
 *   matters more than not putting these on a shared screen.
 *
 *   MILD — masked unless the user opts out. Words that are crude but ordinary
 *   in speech ("damn", "hell", "crap").
 *
 * ── What is deliberately NOT masked ───────────────────────────────────────
 *
 * A filter that mangles honest speech is worse than no filter. Excluded on
 * purpose, despite being crude in some readings:
 *
 *   - Ordinary business/technical words: `git`, `knob`, `screw`, `strip`,
 *     `stripper` (paint/wire), `slag`, `cracker`, `blast`, `shoot`, `kill`,
 *     `sucks`, `sex` (as in same-sex), `sperm` (sperm whale), `damning`.
 *   - Common given names and surnames: `dick`, `willy`, `fanny`, `coon`.
 *     Masking a member's name mid-transcript is its own embarrassment.
 *   - Demonyms, which are not slurs: `bihari` is in the en-IN vocabulary and
 *     stays unmasked — censoring what people call themselves would be worse
 *     than the problem this filter solves. Same reasoning for `gora`.
 *   - Hindi words too ambiguous to mask: `sala` (also a hall, and a surname),
 *     `laude` (as in "magna cum laude").
 *   - Reclaimed identity terms (`queer`) — censoring those can offend more
 *     than leaving them.
 *   - Clinical terms with real medical use: `spastic`, `vaginal`.
 *   - Insults that are rude but not embarrassing to display: `stupid`,
 *     `idiot`, `moron`, `drunk`.
 *   - `god`, `jesus`, `christ` — not obscene, and censoring them reads badly.
 *
 * Known trade-offs accepted: `chink` (masks "chink in the armour"), `dyke`
 * (masks the levee sense), `fag` (British for cigarette), `hooker` (the rugby
 * position), `cum` (masks "magna cum laude"). Severity beat idiom in each.
 *
 * ── Why it isn't shown in the UI ──────────────────────────────────────────
 *
 * It's a filter, not a feature: printing 180 profanities and slurs into a
 * settings panel that gets opened on a shared screen defeats the point. Users
 * add their own terms on top (`extraBlockedWords` in the store) and only ever
 * see what they added themselves.
 */
const STRONG_BLOCKED_WORDS: string[] = [
  'anus', 'arse', 'arsed', 'arsehole', 'ass', 'asses',
  'asshole', 'assholes', 'badass', 'bastard', 'bastards', 'batshit',
  'bdsm', 'bestiality', 'bimbo', 'bitch', 'bitched', 'bitches',
  'bitching', 'bitchy', 'blowjob', 'bollocks', 'boner', 'boobies',
  'boobs', 'buggery', 'bullshit', 'bullshitter', 'chink', 'chinks',
  'clusterfuck', 'cock', 'cocks', 'cocksucker', 'cretin', 'cretins',
  'cum', 'cumming', 'cunt', 'dildo', 'douche', 'douchebag',
  'dumbass', 'dyke', 'dykes', 'ejaculate', 'ejaculated', 'ejaculation',
  'erotic', 'erotica', 'fag', 'faggot', 'faggots', 'fags',
  'fart', 'farted', 'farting', 'farts', 'floozy', 'fuck',
  'fucked', 'fucker', 'fuckers', 'fuckin', 'fucking', 'fucks',
  'gook', 'gyp', 'gypped', 'homos', 'honky', 'hooker',
  'hookers', 'horny', 'hussy', 'imbecile', 'imbeciles', 'incest',
  'incestuous', 'jackass', 'lund', 'masturbate', 'masturbating', 'masturbation',
  'midget', 'midgets', 'minge', 'minger', 'molest', 'molestation',
  'molested', 'molester', 'molesters', 'molesting', 'mongoloid', 'motherfucker',
  'motherfuckers', 'nigga', 'niggaz', 'nigger', 'niggers', 'nipple',
  'nipples', 'nude', 'nudes', 'orgasm', 'orgasmic', 'orgasms',
  'paedo', 'paedophile', 'paedophiles', 'paedophilia', 'paki', 'pedophile',
  'pedophiles', 'pedophilia', 'penis', 'penises', 'pimp', 'pimps',
  'piss', 'pissed', 'pisses', 'pissing', 'pissy', 'poop',
  'pooped', 'pooping', 'poopy', 'porn', 'porno', 'prat',
  'prick', 'pricks', 'pussies', 'pussy', 'randi', 'rape',
  'raped', 'rapes', 'rapist', 'rapists', 'rectum', 'retard',
  'retarded', 'retards', 'scrotum', 'scumbag', 'scumbags', 'semen',
  'seminude', 'shit', 'shite', 'shithead', 'shitless', 'shittiest',
  'shitting', 'shitty', 'skank', 'skanky', 'slut', 'sluts',
  'slutty', 'smartass', 'sodomize', 'sodomized', 'sodomy', 'spic',
  'striptease', 'testicle', 'testicles', 'threesome', 'tits', 'tosser',
  'towelhead', 'tranny', 'turd', 'turds', 'twat', 'vagina',
  'vaginas', 'viagra', 'vibrator', 'vibrators', 'wank', 'wanker',
  'wankers', 'whore', 'whorehouse', 'whores', 'whoring',
]

/** Crude but ordinary in speech — masked unless the user turns this tier off. */
const MILD_BLOCKED_WORDS: string[] = [
  'bloody', 'bugger', 'buggered', 'crap', 'crapper', 'crappy',
  'damn', 'damned', 'damnit', 'diarrhea', 'faeces', 'feces',
  'goddam', 'goddamn', 'hell', 'hella', 'snot', 'snotty',
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

/** Counts are safe to show in the UI, unlike the words themselves. */
export const STRONG_BLOCKED_COUNT = STRONG_BLOCKED_WORDS.length
export const MILD_BLOCKED_COUNT = MILD_BLOCKED_WORDS.length

/**
 * Effective blocked set: strong tier (always) + mild tier (unless opted out) +
 * whatever the user added. The built-in tiers are never listed or cleared.
 */
export function buildBlockedSet(
  extraWords: string[] = [],
  includeMild = true
): Set<string> {
  const set = new Set(STRONG_BLOCKED_WORDS)
  if (includeMild) for (const w of MILD_BLOCKED_WORDS) set.add(w)
  for (const w of extraWords) {
    const n = normalizeBlockedWord(w)
    if (n) set.add(n)
  }
  return set
}
