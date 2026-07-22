import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../store'

const TICK_MS = 250

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface TimerProps {
  onAutoStop: () => void
}

export function Timer({ onAutoStop }: TimerProps) {
  const status = useSessionStore((s) => s.status)
  const startAt = useSessionStore((s) => s.sessionStartAt)
  const endAt = useSessionStore((s) => s.sessionEndAt)
  const target = useSessionStore((s) => s.targetDurationMs)

  const [now, setNow] = useState(() => Date.now())
  const stoppedRef = useRef(false)

  // Reset the auto-stop latch whenever a fresh session begins.
  useEffect(() => {
    if (status === 'listening') stoppedRef.current = false
  }, [status, startAt])

  // Tick only while listening. Idle timer just shows the last elapsed value
  // (or 0:00 before the first session).
  useEffect(() => {
    if (status !== 'listening') return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [status])

  const elapsedMs =
    status === 'listening' && startAt !== null
      ? Math.max(0, now - startAt)
      : startAt !== null && endAt !== null
        ? Math.max(0, endAt - startAt)
        : 0

  const remainingMs = target !== null ? target - elapsedMs : null

  // Fire the auto-stop callback once when the target is reached.
  useEffect(() => {
    if (
      status === 'listening' &&
      target !== null &&
      elapsedMs >= target &&
      !stoppedRef.current
    ) {
      stoppedRef.current = true
      onAutoStop()
    }
  }, [status, target, elapsedMs, onAutoStop])

  const inFinalTen =
    remainingMs !== null && remainingMs > 0 && remainingMs <= 10_000
  const isLive = status === 'listening'

  const classes = [
    'timer',
    isLive ? 'timer-live' : '',
    inFinalTen ? 'timer-warning' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} aria-live="polite">
      <span className="timer-dot" aria-hidden />
      <span className="timer-elapsed">{formatTime(elapsedMs)}</span>
      {target !== null ? (
        <span className="timer-target">/ {formatTime(target)}</span>
      ) : null}
    </div>
  )
}
