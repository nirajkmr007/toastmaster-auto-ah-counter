#!/usr/bin/env node
/**
 * Generate a training corpus for Vosk LM adaptation that is heavy on filler
 * words, so the rebuilt language model raises the probability of um/uh/er/ah
 * and the decoder stops "correcting" them into real words.
 *
 * Output is lowercased, punctuation-stripped, one utterance per line — the
 * format Vosk's LM rebuild expects (see scripts/lm-adapt/README.md).
 *
 * IMPORTANT: an LM rebuilt purely from fillers would destroy general
 * recognition. So this corpus is mostly ordinary speech-style sentences with
 * fillers *injected* at a realistic rate, plus a smaller block of
 * filler-dense lines to lift their weight. It biases the vocabulary toward
 * conversational/meeting English — a good fit for Toastmasters, less so for
 * arbitrary domains.
 *
 * Usage:
 *   node generate-corpus.mjs [outFile] [lines] [fillersPerSentenceMax]
 *   node generate-corpus.mjs text.txt 6000 3
 *
 * Only these fillers are injected; they must already exist in the model's
 * vocabulary (they do in vosk-model-small-en-us-0.15). New words cannot be
 * introduced via LM rebuild.
 */

import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'text.txt'
const LINES = Number(process.argv[3] ?? 6000)
const MAX_FILLERS = Number(process.argv[4] ?? 3)

const FILLERS = ['um', 'uh', 'er', 'ah', 'hmm']

// Speech / meeting / Toastmasters-flavored base sentences. Keep them plain:
// lowercase, no punctuation, common vocabulary.
const BASE = [
  'good evening fellow toastmasters and welcome to our meeting tonight',
  'today i want to talk about a small habit that changed my routine',
  'thank you mister chairman and thank you all for being here',
  'the purpose of my speech is to share a story from last year',
  'let me start by asking you a simple question',
  'when i first tried this i honestly did not think it would work',
  'over time that small change made a real difference in my work',
  'i would like to begin with a story about my grandfather',
  'the second point i want to make is about preparation',
  'as you can see the results speak for themselves',
  'in conclusion i want to leave you with one final thought',
  'please join me in welcoming our next speaker to the stage',
  'the grammarian for tonight has chosen an interesting word',
  'i evaluated the speech and i found three things worth praising',
  'my challenge to you this week is to practice every single day',
  'we often underestimate how much a routine can shape our results',
  'the best speakers are not born they are made through practice',
  'i remember standing here for the very first time feeling nervous',
  'let us give a warm round of applause to all our speakers',
  'the timer showed that i was running close to my limit',
  'i planned my morning so that i could focus before meetings started',
  'this idea is simple but it takes real discipline to follow through',
  'when i walked into the room i knew something had shifted',
  'the meeting agenda has several roles for members to fill',
  'i want to thank the table topics master for those questions',
  'preparation is the difference between a good speech and a great one',
  'we learn far more from our mistakes than from our successes',
  'the audience leaned forward as the speaker lowered her voice',
  'my goal tonight is to keep this short and to keep it clear',
  'a pause can be more powerful than any word you choose',
  'i counted the filler words during each of the prepared speeches',
  'the club has grown steadily over the past couple of years',
  'every meeting gives us a chance to try something new',
  'i was inspired by the courage it took to share that story',
  'let me paint a picture of what that morning looked like',
  'the feedback i received helped me improve my delivery',
  'confidence comes from repetition and from honest feedback',
  'we should celebrate progress even when it feels small',
  'the room went quiet as the final speaker took the stage',
  'i will close with a question for each of you to consider',
]

const rand = (n) => Math.floor(Math.random() * n)
const pick = (arr) => arr[rand(arr.length)]

// Insert up to `max` fillers at word boundaries within a sentence.
function inject(sentence, max) {
  const words = sentence.split(' ')
  const n = rand(max + 1) // 0..max
  for (let i = 0; i < n; i++) {
    const pos = rand(words.length + 1)
    words.splice(pos, 0, pick(FILLERS))
  }
  return words.join(' ')
}

const out = []

// ~85% ordinary sentences with light-to-moderate filler injection.
const injected = Math.floor(LINES * 0.85)
for (let i = 0; i < injected; i++) {
  out.push(inject(pick(BASE), MAX_FILLERS))
}

// ~15% filler-dense lines (starts/hesitations) to strongly lift filler weight.
const dense = LINES - injected
for (let i = 0; i < dense; i++) {
  const lead = Array.from({ length: 1 + rand(2) }, () => pick(FILLERS)).join(' ')
  out.push(`${lead} ${inject(pick(BASE), MAX_FILLERS)}`)
}

// Shuffle so filler-dense lines are spread through the corpus.
for (let i = out.length - 1; i > 0; i--) {
  const j = rand(i + 1)
  ;[out[i], out[j]] = [out[j], out[i]]
}

writeFileSync(OUT, out.join('\n') + '\n', 'utf8')

const fillerCount = out.join(' ').split(' ').filter((w) => FILLERS.includes(w)).length
console.log(
  `Wrote ${out.length} lines to ${OUT} (~${fillerCount} filler tokens, fillers: ${FILLERS.join(', ')}).`
)
