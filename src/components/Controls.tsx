import { useSessionStore } from '../store'
import type { Sensitivity } from '../detection/detector'
import { PRESETS } from '../detection/presets'

interface ControlsProps {
  onStart: () => void
  onStop: () => void
}

const SENSITIVITY_LEVELS: Sensitivity[] = ['strict', 'balanced', 'loose']

export function Controls({ onStart, onStop }: ControlsProps) {
  const status = useSessionStore((s) => s.status)
  const sensitivity = useSessionStore((s) => s.sensitivity)
  const setSensitivity = useSessionStore((s) => s.setSensitivity)
  const presetName = useSessionStore((s) => s.presetName)
  const setPreset = useSessionStore((s) => s.setPreset)
  const speakerName = useSessionStore((s) => s.speakerName)
  const errorMessage = useSessionStore((s) => s.errorMessage)

  const canStart = status === 'idle' || status === 'ready'
  const isBusy = status === 'loading-model'
  const isRunning = status === 'listening'
  const canPressStart = canStart && speakerName.trim().length > 0

  return (
    <div className="controls">
      <div className="controls-row">
        <div className="select-group">
          <label htmlFor="preset">Preset</label>
          <select
            id="preset"
            value={presetName}
            onChange={(e) => setPreset(e.target.value, PRESETS[e.target.value])}
            disabled={isRunning || isBusy}
          >
            {Object.keys(PRESETS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

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
                {s[0].toUpperCase() + s.slice(1)}
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
            {isBusy ? 'Starting…' : 'Start listening'}
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
