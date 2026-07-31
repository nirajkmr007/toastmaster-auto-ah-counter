import { useEffect, useLayoutEffect, useState } from 'react'
import { useSessionStore } from '../store'

const SEEN_KEY = 'ah-counter-tour-v1'

interface Step {
  title: string
  body: string
  selector: string | null // null = centered card (no spotlight)
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Ah-Counter',
    body: 'A live filler-word counter for Toastmasters. Everything runs on your device — your audio never leaves the browser, and nothing is uploaded or stored. Recognition happens locally.',
    selector: null,
  },
  {
    title: 'Add your speakers',
    body: 'Add everyone who will take the floor, then tap a name to mark who is speaking now. Each speaker keeps their own counts, transcript, and time.',
    selector: '[data-tour="speakers"]',
  },
  {
    title: 'Session controls',
    body: 'Choose detection sensitivity and an optional speech length, then press Start listening. Stop ends the turn and opens the report.',
    selector: '[data-tour="controls"]',
  },
  {
    title: 'Speech timer',
    body: 'Shows the active speaker’s elapsed time with a green / yellow / red signal against the speech length you picked.',
    selector: '[data-tour="timer"]',
  },
  {
    title: 'Crutch words',
    body: 'Word fillers like “so”, “like”, “actually” — found in the transcript. Use the − / + / × on any bubble to fix a miscount.',
    selector: '[data-tour="crutch"]',
  },
  {
    title: 'Sound fillers',
    body: 'Hesitation sounds — “um”, “uh”, “er”, “ah” — caught by a dedicated recognizer so they are not smoothed into real words.',
    selector: '[data-tour="sound"]',
  },
  {
    title: 'Add or correct manually',
    body: 'Tap a chip to add a filler the model missed, or type a new one. You are always the final judge of the count.',
    selector: '[data-tour="manual"]',
  },
  {
    title: 'Live transcript',
    body: 'Counted crutch words are highlighted here. Click a highlighted word to dismiss a false positive — it drops that count by one.',
    selector: '[data-tour="transcript"]',
  },
  {
    title: 'Manage filler words',
    body: 'Open settings to add or remove any sound or word from the lists. Your list is saved on this device only.',
    selector: '[data-tour="settings"]',
  },
  {
    title: 'Report & session',
    body: 'Stopping opens a per-speaker report (with PNG export). “New session” clears counts but keeps the roster; “Copy session log” exports JSON.',
    selector: '[data-tour="footer"]',
  },
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export function Tour() {
  const showTour = useSessionStore((s) => s.showTour)
  const closeTour = useSessionStore((s) => s.closeTour)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (showTour) setI(0)
  }, [showTour])

  useLayoutEffect(() => {
    if (!showTour) return
    const step = STEPS[i]
    if (!step.selector) {
      setRect(null)
      return
    }
    const el = document.querySelector(step.selector) as HTMLElement | null
    if (!el) {
      setRect(null)
      return
    }
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    const measure = () => {
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    const t = window.setTimeout(measure, 340) // settle after smooth scroll
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [showTour, i])

  if (!showTour) return null

  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // ignore
    }
    closeTour()
  }

  const isLast = i === STEPS.length - 1
  const step = STEPS[i]

  // Position the card near the spotlight, or centered when there's no target.
  let cardStyle: React.CSSProperties = {}
  if (rect) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const preferBelow = rect.top + rect.height + 210 < vh
    const top = preferBelow ? rect.top + rect.height + 14 : Math.max(12, rect.top - 200)
    const left = Math.min(Math.max(12, rect.left), Math.max(12, vw - 352))
    cardStyle = { top, left }
  }

  const PAD = 6

  return (
    <div className="tour" role="dialog" aria-label="App tour">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div className={`tour-card ${rect ? 'tour-card-anchored' : 'tour-card-centered'}`} style={cardStyle}>
        <div className="tour-counter">
          Step {i + 1} of {STEPS.length}
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={finish}>
            Skip tour
          </button>
          <div className="tour-nav">
            <button
              type="button"
              className="tour-btn"
              onClick={() => setI((n) => Math.max(0, n - 1))}
              disabled={i === 0}
            >
              Back
            </button>
            {isLast ? (
              <button type="button" className="tour-btn tour-btn-primary" onClick={finish}>
                Done
              </button>
            ) : (
              <button
                type="button"
                className="tour-btn tour-btn-primary"
                onClick={() => setI((n) => Math.min(STEPS.length - 1, n + 1))}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const TOUR_SEEN_KEY = SEEN_KEY
