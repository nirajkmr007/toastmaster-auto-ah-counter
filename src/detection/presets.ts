import type { WordList } from './detector'

export const TOASTMASTERS_CLASSIC: WordList = {
  soundFillers: ['um', 'uh', 'er', 'ah', 'hmm', 'huh'],
  crutchWords: ['so', 'like', 'basically', 'actually', 'literally', 'right'],
  crutchPhrases: ['you know', 'i mean', 'sort of', 'kind of'],
}

export const CORPORATE_SPEAK: WordList = {
  soundFillers: ['um', 'uh', 'er', 'ah'],
  crutchWords: ['so', 'like', 'basically', 'literally', 'obviously', 'essentially'],
  crutchPhrases: ['you know', 'i mean', 'to be honest', 'at the end of the day'],
}

export const PRESETS: Record<string, WordList> = {
  'Toastmasters Classic': TOASTMASTERS_CLASSIC,
  'Corporate Speak': CORPORATE_SPEAK,
}
