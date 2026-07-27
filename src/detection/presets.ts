import { SOUND_FILLER_VARIANTS, type WordList } from './detector'

// Sound-filler spellings live in detector.ts (FILLER_CANONICAL) so the list
// and the variant→canonical map can't drift apart. Presets just reference it.

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
