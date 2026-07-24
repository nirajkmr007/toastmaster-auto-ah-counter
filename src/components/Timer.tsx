import { useEffect, useState } from 'react'
import { useSessionStore, selectActiveSpeaker } from '../store'

const TICK_MS = 250

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Toastmasters-style signal from the per-speech clock: green once the speaker
// reaches ~60% of the target (qualifying minimum), yellow near the end, red at
// or past the max. No auto-stop — the operator controls when to move on.
type Signal = 'none' | 'green' | 'yellow' | 'red'
function signalFor(elapsed: number, target: number | null): Signal {
  if (target == null || target <= 0) return 'none'
  const r = elapsed / target
  if (r >= 1) return 'red'
  if (r >= 0.8) return 'yellow'
  if (r >= 0.6) return 'green'
  return 'none'
}

export function Timer() {
  const status = useSessionStore((s) => s.status)
  const active = useSessionStore(selectActiveSpeaker)
  const target = useSessionStore((s) => s.targetDurationMs)

  const [now, setNow] = useState(() => Date.now())

  const listening = status === 'listening'

  useEffect(() => {
    if (!listening) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [listening])

  // Active speaker's current speech time: accumulated + open interval.
  const elapsedMs =
    (active?.speakingMs ?? 0) +
    (listening && active?.activeSince != null ? Math.max(0, now - active.activeSince) : 0)

  const signal = signalFor(elapsedMs, target)

  const classes = ['timer', listening ? 'timer-live' : '', `timer-${signal}`]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} aria-live="polite">
      <span className="timer-dot" aria-hidden />
      <span className="timer-elapsed">{formatTime(elapsedMs)}</span>
      {target != null ? (
        <span className="timer-target">/ {formatTime(target)}</span>
      ) : null}
      {active ? <span className="timer-who">{active.name}</span> : null}
    </div>
  )
}
