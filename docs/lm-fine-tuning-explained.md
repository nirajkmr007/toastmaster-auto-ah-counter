# How the filler-tuned model works (and how to balance it)

This explains what the "Vosk small (en-US, filler-tuned)" model in the Model
dropdown actually is, how we built it, and — since it now over-counts — how to
tune the balance. For the exact commands, see
[`scripts/lm-adapt/README.md`](../scripts/lm-adapt/README.md).

## The one-sentence version

We did **not** retrain the model to "hear" fillers better. We re-weighted its
**language model** so it *expects* `um`/`uh`/`er`/`ah` and stops rewriting them
into real words.

## How a Vosk model decides what you said

A Vosk (Kaldi) model has three parts working together:

1. **Acoustic model** — maps the raw audio to candidate sounds/phonemes. "What
   noises did I hear?"
2. **Dictionary (lexicon)** — the set of words it knows and how they're
   pronounced. It can only ever output words that are in here.
3. **Language model (LM)** — the probabilities of words and word sequences.
   "Given the sounds and what usually follows what, which words are most
   likely?"

The recognizer combines all three and picks the most probable sentence.

## Why fillers were getting missed

`um`, `uh`, `er`, `ah` **are** in the small model's dictionary (we verified
this — the vocabulary contains them and dozens of drawn-out variants like
`uhh`, `ummm`). So the acoustic model can hear them and the dictionary can spell
them.

The problem was the **language model**: a bare "uh" is rare in the text the
stock LM was trained on, so it assigned it a low probability. When you mumbled
"uh," the recognizer saw two options — the filler "uh" (low LM probability) or
some real word that sounds vaguely similar (higher LM probability) — and the LM
tipped it toward the real word. The filler got silently "corrected away."

## What we actually changed

We rebuilt **only the language model** from a corpus where fillers appear
constantly, so their probability shoots up. Now when the acoustic model hears a
hesitation, the LM no longer overrules it — the filler wins.

Nothing else changed: same acoustic model, same dictionary, same ~40 MB size.
We could not have *added* new filler words this way (LM rebuild can only
re-weight words already in the dictionary) — but we didn't need to, since the
fillers were already there.

## The pipeline, briefly

1. `generate-corpus.mjs` writes `text.txt`: thousands of speech-style
   sentences with `um/uh/er/ah/hmm` injected heavily.
2. `farcompilestrings` turns each line into a small finite-state transducer,
   using the model's own vocabulary (out-of-vocabulary words map to `[unk]`).
3. `ngramcount` + `ngrammake` learn n-gram probabilities from that corpus —
   this is where "fillers are frequent" becomes real numbers.
4. `fstconvert` writes it as the `Gr.fst` grammar file.
5. We swap that `Gr.fst` into a copy of the model and repackage it as a
   separate `…-fillers.tar.gz`, so the original is untouched and both appear in
   the dropdown for comparison.

## The catch: it now over-counts (recall vs precision)

You've seen this live — the tuned model flags a lot more `ah`/`um`, including
ones that weren't really said. That's not a bug; it's the direct consequence of
what we did, and it's the fundamental tension in this kind of tuning:

- **Recall** = of the real fillers, how many did we catch? (We raised this.)
- **Precision** = of the ones we flagged, how many were real? (We lowered this.)

You cannot maximize both at once. By making the LM *expect* fillers everywhere,
we also made it insert them on any ambiguous or noisy audio — a hesitation-
shaped blip now gets read as "uh" even when it wasn't one. Two things in our
build pushed it too far toward recall:

- The corpus injects fillers very densely (up to 3 per sentence, plus a block
  of filler-only lines).
- Uncommon words in the sample sentences became `[unk]`, which adds noise and
  further inflates the fillers' relative weight.

## Finding the balance — what we could do

The good news: it's a fast loop. Regenerate the corpus, rebuild, repackage,
compare. Options, roughly from easiest to most involved:

1. **Lower the filler density.** Regenerate with gentler settings, e.g.
   `node scripts/lm-adapt/generate-corpus.mjs text.txt 6000 1` (1 filler max per
   sentence instead of 3), and drop the filler-only block. Less aggressive =
   fewer false positives.
2. **Dilute with generic English.** Concatenate a large, ordinary English text
   corpus with the filler-injected one so normal speech dominates and fillers
   are only a modest boost. This is proper LM *interpolation* (Vosk's
   [LM guide](https://alphacephei.com/vosk/lm)) and gives the best
   recall/precision trade — at the cost of sourcing a good base corpus.
3. **Clean the sample sentences** so almost everything is in-vocabulary (remove
   words like "grammarian"/"toastmasters" that become `[unk]`). Less noise.
4. **Tune n-gram order / smoothing** in `ngrammake` if you want finer control.
5. **Don't fight it in the model at all.** Keep the stock model as default,
   treat the tuned model as an optional "high-recall" mode, and lean on the
   in-app **manual −/+/× controls** to correct counts. For an ah-counter,
   over-counting is arguably worse than under-counting (it annoys speakers), so
   a slightly conservative model + quick manual add is a very defensible
   operating point.

### Suggested next step

Try option 1 first — regenerate at `... 6000 1`, rebuild, and compare against
the current tuned model. If it's still trigger-happy, move to option 2
(interpolation). If tuning stops being worth the effort, option 5 is the honest
fallback: the manual controls already make the human ah-counter the final
authority, which is exactly how the real Toastmasters role works.

The knobs live in
[`generate-corpus.mjs`](../scripts/lm-adapt/generate-corpus.mjs) (density) and
the `ngrammake` step in
[`rebuild-lm.sh`](../scripts/lm-adapt/rebuild-lm.sh) (smoothing).
