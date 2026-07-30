import { useSessionStore } from '../store'
import type { Sensitivity } from '../detection/detector'

interface ControlsProps {
  onStart: () => void
  onStop: () => void
}

// Ordered most-sensitive → least-sensitive so the label matches expectation.
const SENSITIVITY_LEVELS: Sensitivity[] = [
  'extra-strict',
  'strict',
  'balanced',
  'loose',
]

const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  'extra-strict': 'Extra strict',
  strict: 'Strict',
  balanced: 'Balanced',
  loose: 'Loose',
}

// Common Toastmasters durations. Values are in milliseconds; null = no limit.
const TIME_LIMIT_OPTIONS: { label: string; ms: number | null }[] = [
  { label: 'No limit', ms: null },
  { label: '1 min', ms: 60_000 },
  { label: '2 min', ms: 120_000 },
  { label: '3 min', ms: 180_000 },
  { label: '5 min', ms: 300_000 },
  { label: '7 min', ms: 420_000 },
]

export function Controls({ onStart, onStop }: ControlsProps) {
  const status = useSessionStore((s) => s.status)
  const sensitivity = useSessionStore((s) => s.sensitivity)
  const setSensitivity = useSessionStore((s) => s.setSensitivity)
  const speakerCount = useSessionStore((s) => s.speakers.length)
  const errorMessage = useSessionStore((s) => s.errorMessage)
  const loadingMessage = useSessionStore((s) => s.loadingMessage)
  const targetDurationMs = useSessionStore((s) => s.targetDurationMs)
  const setTargetDuration = useSessionStore((s) => s.setTargetDuration)

  const canStart = status === 'idle' || status === 'ready'
  const isBusy = status === 'loading-model'
  const isRunning = status === 'listening'
  const canPressStart = canStart && speakerCount > 0

  return (
    <div className="controls">
      <div className="controls-row">
        <div className="select-group">
          <label htmlFor="sensitivity">Sensitivity</label>
          <select
            id="sensitivity"
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as Sensitivity)}
            disabled={isRunning || isBusy}
          >
            {SENSITIVITY_LEVELS.map((s) => (
              <option key={s} value={s}>
                {SENSITIVITY_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="select-group">
          <label htmlFor="time-limit">Speech length</label>
          <select
            id="time-limit"
            value={targetDurationMs === null ? 'none' : String(targetDurationMs)}
            onChange={(e) =>
              setTargetDuration(
                e.target.value === 'none' ? null : Number(e.target.value)
              )
            }
            disabled={isRunning || isBusy}
            title="Per-speech time guide — drives the green/yellow/red signal"
          >
            {TIME_LIMIT_OPTIONS.map((opt) => (
              <option
                key={opt.label}
                value={opt.ms === null ? 'none' : String(opt.ms)}
              >
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {isRunning ? (
          <button
            type="button"
            className="btn btn-stop"
            onClick={onStop}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-start"
            onClick={onStart}
            disabled={!canPressStart || isBusy}
          >
            {isBusy ? loadingMessage ?? 'Starting…' : 'Start listening'}
          </button>
        )}
      </div>

      {errorMessage ? (
        <div className="error-banner" role="alert">
          {errorMessage}
        </div>
      ) : null}
    </div>
  )
}
