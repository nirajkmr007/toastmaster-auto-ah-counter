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

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Controls({ onStart, onStop }: ControlsProps) {
  const status = useSessionStore((s) => s.status)
  const sensitivity = useSessionStore((s) => s.sensitivity)
  const setSensitivity = useSessionStore((s) => s.setSensitivity)
  const speakerCount = useSessionStore((s) => s.speakers.length)
  const errorMessage = useSessionStore((s) => s.errorMessage)
  const loadingMessage = useSessionStore((s) => s.loadingMessage)
  const targetDurationMs = useSessionStore((s) => s.targetDurationMs)
  const setTargetDuration = useSessionStore((s) => s.setTargetDuration)
  const hardStopMs = useSessionStore((s) => s.hardStopMs)

  const canStart = status === 'idle' || status === 'ready'
  const isBusy = status === 'loading-model'
  const isRunning = status === 'listening'
  const canPressStart = canStart && speakerCount > 0

  return (
    <div className="controls" data-tour="controls">
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

        <div className="select-group slider-group">
          <label htmlFor="speech-length">
            Speech length{' '}
            <span className="slider-value">
              {targetDurationMs ? formatMs(targetDurationMs) : 'off'}
            </span>
          </label>
          <input
            type="range"
            id="speech-length"
            min={0}
            max={hardStopMs}
            step={30_000}
            value={targetDurationMs ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value)
              setTargetDuration(v === 0 ? null : v)
            }}
            disabled={isRunning || isBusy}
            title="Per-speech time guide — drives the green/yellow/red signal. Max is the hard stop."
          />
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
