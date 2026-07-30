// Single speech model. Both recognizers (full transcript + sound-filler
// grammar) share this one download. The filler "detection" is not a separate
// model — recognizer B just restricts this same model's grammar to filler
// sounds (see voskEngine.ts).
export const MODEL_URL =
  'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz'
