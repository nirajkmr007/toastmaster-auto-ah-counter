#!/usr/bin/env node
/**
 * Build a training corpus dominated by real English, with fillers as a light
 * garnish. This is the "dilute with generic English" approach: the language
 * model learns ordinary speech from the base corpus and only gets a modest
 * nudge toward fillers — so it keeps recognizing normal words (unlike a corpus
 * built purely from filler-injected templates, which destroys general
 * recognition).
 *
 * Usage:
 *   node mix-corpus.mjs <generic.txt> [out] [maxLines] [fillerRate] [maxFillers]
 *   node mix-corpus.mjs .cache/generic-en.txt text.txt 50000 0.12 1
 *
 * fillerRate = fraction of lines that get a filler (0.12 = 12%). Lower = a
 * lighter touch = fewer phantom fillers. This is the main balance knob.
 */

import { readFileSync, writeFileSync } from 'node:fs'

const [, , GENERIC, OUT = 'text.txt', MAXLINES = '50000', RATE = '0.12', MAXF = '1'] =
  process.argv

if (!GENERIC) {
  console.error(
    'usage: mix-corpus.mjs <generic.txt> [out] [maxLines] [fillerRate] [maxFillers]'
  )
  process.exit(1)
}

const FILLERS = ['um', 'uh', 'er', 'ah', 'hmm']
const maxLines = Number(MAXLINES)
const rate = Number(RATE)
const maxF = Number(MAXF)
const rand = (n) => Math.floor(Math.random() * n)
const pick = (a) => a[rand(a.length)]

// Normalize each line: lowercase, keep only letters/apostrophe/space, and keep
// only reasonably-sized sentences so the LM sees clean, typical speech.
const norm = []
for (const raw of readFileSync(GENERIC, 'utf8').split(/\r?\n/)) {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const wc = s ? s.split(' ').length : 0
  if (wc >= 3 && wc <= 25) norm.push(s)
}

// Shuffle so a capped subset is still varied, then take maxLines.
for (let i = norm.length - 1; i > 0; i--) {
  const j = rand(i + 1)
  ;[norm[i], norm[j]] = [norm[j], norm[i]]
}
const take = norm.slice(0, maxLines)

// Inject fillers into a small fraction of lines.
const out = take.map((s) => {
  if (Math.random() >= rate) return s
  const words = s.split(' ')
  const n = 1 + rand(maxF) // 1..maxF
  for (let i = 0; i < n; i++) words.splice(rand(words.length + 1), 0, pick(FILLERS))
  return words.join(' ')
})

writeFileSync(OUT, out.join('\n') + '\n', 'utf8')
const fillerTokens = out
  .join(' ')
  .split(' ')
  .filter((w) => FILLERS.includes(w)).length
console.log(
  `Wrote ${out.length} lines to ${OUT} — ${fillerTokens} filler tokens (rate ${rate}). ` +
    `Base corpus dominates; fillers are a light garnish.`
)
