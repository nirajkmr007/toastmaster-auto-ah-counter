# AH-5 — Precision test protocol

A ~5-minute self-administered test to check whether the rule-based detector
hits **≥ 70 % precision under Balanced mode** on realistic speech. Below that
threshold, we spike the LLM-classifier alternative (parked in the roadmap)
before investing more in UI or multi-tab work.

## Setup

1. Quiet room, one microphone, Chrome or Edge.
2. `npm run dev` → open `http://localhost:5173`.
3. Add one speaker (any name). Preset **Toastmasters Classic**. Set
   Sensitivity to **Balanced** — this test measures the rule layer, so switch
   off the **Extra strict** default.
4. Click **Start listening**, wait for the button to turn red (Stop).
5. Read the four sections below back-to-back at conversational pace (~140 wpm).
   Pause 3–5 seconds between sections so Vosk closes each utterance.
6. Click **Stop**, then **Copy session log** in the footer. The JSON is keyed
   by speaker (`speakers[0].detections`); use that speaker's detections for
   scoring below.

## The script

### Section 1 — Clean speech (control)

_Read as written. No intentional fillers. Expect ~0 detections._

> Today I want to talk about how a small daily habit can reshape a year.
> Each morning I set aside twenty minutes to plan my day, and this ritual
> alone has changed how I work. I no longer feel pulled in ten directions
> before breakfast. Instead, I arrive at my desk knowing which task actually
> matters. Over time, that clarity compounds. My work is better, and I
> finish earlier. It is a quiet change, but every quiet change is a beginning.

### Section 2 — Sound fillers

_Read every "um" and "uh" as written; do not skip them. Speak them like real
disfluencies (short, low emphasis)._

> So, um, when I first tried this — uh, back in January — I honestly didn't
> think it would work. Um, planning felt like, uh, one more chore. But, um,
> the second week, uh, something shifted. I noticed, um, my focus was
> sharper, and, uh, I finished the important tasks earlier. Um, by the end
> of the month, uh, I had, um, more energy in the evenings too. Um, I want
> to be clear — this is not, uh, magic. Um, it is just, uh, a few minutes
> of thinking before the day starts. Um, but, uh, that small thing, uh,
> changes everything.

### Section 3 — Crutch words as fillers

_Read at pace; treat "so," "like," "basically," "you know," "actually" as
verbal tics. This section is intentionally over-dense to trigger the
30-second frequency threshold._

> So basically, when you start doing this, like, every single day, you
> know, it becomes easier. So the key thing is, like, you have to actually
> sit down. So, you know, most people, like, they skip it on Mondays
> because Mondays are basically chaos. But, so, if you push through, like,
> that first Monday, you know, the rest of the week is fine. Actually,
> I mean, most weeks are fine after that. So like, my one tip is,
> basically, don't overthink it. You know, just start. Like, literally
> just open the notebook. So, basically, the whole trick is just showing
> up. You know? Like, that's really it.

### Section 4 — Crutch words in legitimate use

_Read at pace. These "so"s and "likes" are grammatical, not filler.
Expect ~0 detections._

> I planned my morning so that I could focus deeply before meetings started.
> I like to work in a quiet room, like a library, so my ideas can settle.
> The routine is basically the same each day, and I actually think that's
> why it works. You know your rhythm best, so build around it. If you like
> to write early, do that. If you think best while walking, like a park
> walker, then walk. It is basically about matching the task to your
> natural energy. I mean this seriously — you already know what you need,
> you just don't always trust it.

## Scoring

For each detection in the speaker's log (`speakers[0].detections` in the
session-log JSON):

- **TP** (true positive) — you actually said this word AS a filler at that point.
- **FP** (false positive) — you said the word, but as a legitimate part of speech.

Then:

**Precision = TP / (TP + FP)**

Also spot-check the transcript for words you said as fillers that the app
did NOT count (false negatives) — helpful for tuning, not the ship gate.

### Approximate expected true positives (rough targets, ±20 %)

| Section | Word / phrase   | Expected TP under Balanced |
| ------- | --------------- | -------------------------- |
| 1       | any             | 0                          |
| 2       | um              | ~13                        |
| 2       | uh              | ~7                         |
| 2       | so (start)      | 1                          |
| 3       | so              | ~5 (after threshold)       |
| 3       | like            | ~7 (after threshold)       |
| 3       | basically       | ~4                         |
| 3       | you know        | ~4                         |
| 3       | actually        | ~1–2                       |
| 4       | so, like, basically, actually | 0 (context rules should filter) |

Section 4 is the hardest. If precision there is below 50 %, the position
rules for `so` and `like` are the first place to look — see
`src/detection/detector.ts` → `shouldFilterByContext`.

### Ship gate

- **Overall precision ≥ 70 %** in Balanced mode → the rule layer is good
  enough; keep Balanced as a viable option alongside the Extra-strict default.
- **Overall precision < 70 %** → open a new issue to spike an LLM-based
  classifier for ambiguous crutch words (called out in the README roadmap).

Paste the raw session-log JSON and your TP/FP tally into a comment on the
Linear issue when you're done so we have the numbers on the record.
