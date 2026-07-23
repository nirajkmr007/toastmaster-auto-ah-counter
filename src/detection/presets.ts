import type { WordList } from './detector'

// Sound-filler variants — Vosk's small-en model transcribes disfluencies
// inconsistently (um / umm / ummm all appear depending on how the speaker
// draws it out), so we enumerate every likely spelling instead of relying on
// a fuzzy matcher.
const SOUND_FILLER_VARIANTS = [
  'um', 'umm', 'ummm',
  'uh', 'uhh', 'uhhh',
  'er', 'err', 'erm',
  'ah', 'ahh', 'ahhh',
  'hmm', 'hmmm', 'hm',
  'huh',
  'eh', 'ehh',
  'mm', 'mmm',
]

export const TOASTMASTERS_CLASSIC: WordList = {
  soundFillers: SOUND_FILLER_VARIANTS,
  crutchWords: ['so', 'like', 'basically', 'actually', 'literally', 'right'],
  crutchPhrases: ['you know', 'i mean', 'sort of', 'kind of'],
}

export const CORPORATE_SPEAK: WordList = {
  soundFillers: SOUND_FILLER_VARIANTS,
  crutchWords: ['so', 'like', 'basically', 'literally', 'obviously', 'essentially'],
  crutchPhrases: ['you know', 'i mean', 'to be honest', 'at the end of the day'],
}

export const PRESETS: Record<string, WordList> = {
  'Toastmasters Classic': TOASTMASTERS_CLASSIC,
  'Corporate Speak': CORPORATE_SPEAK,
}
