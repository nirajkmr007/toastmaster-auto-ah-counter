import { useState } from 'react'
import { useSessionStore } from '../store'

// Speaker roster: add names one by one, see each speaker's running filler
// total, and switch who's currently speaking. The active speaker receives all
// detections and manual adds.
export function Roster() {
  const speakers = useSessionStore((s) => s.speakers)
  const activeSpeakerId = useSessionStore((s) => s.activeSpeakerId)
  const addSpeaker = useSessionStore((s) => s.addSpeaker)
  const removeSpeaker = useSessionStore((s) => s.removeSpeaker)
  const setActiveSpeaker = useSessionStore((s) => s.setActiveSpeaker)
  const status = useSessionStore((s) => s.status)

  const [name, setName] = useState('')
  const listening = status === 'listening'

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addSpeaker(trimmed)
    setName('')
  }

  const total = (id: string) => {
    const sp = speakers.find((s) => s.id === id)
    if (!sp) return 0
    return Object.values(sp.counts).reduce((a, b) => a + b, 0)
  }

  return (
    <div className="roster">
      <div className="roster-add">
        <span className="label">
          Speakers <span className="required" aria-hidden="true">*</span>
        </span>
        <div className="roster-add-row">
          <input
            type="text"
            placeholder="Add speaker name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            maxLength={40}
            autoComplete="off"
          />
          <button
            type="button"
            className="roster-add-btn"
            onClick={submit}
            disabled={!name.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {speakers.length > 0 ? (
        <div className="roster-chips" role="tablist" aria-label="Speakers">
          {speakers.map((sp) => {
            const isActive = sp.id === activeSpeakerId
            return (
              <div
                key={sp.id}
                className={`chip ${isActive ? 'chip-active' : ''}`}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveSpeaker(sp.id)}
                title={
                  listening && isActive
                    ? 'Currently speaking'
                    : 'Click to make active'
                }
              >
                {listening && isActive ? (
                  <span className="chip-live" aria-hidden />
                ) : null}
                <span className="chip-name">{sp.name}</span>
                <span className="chip-count">{total(sp.id)}</span>
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`Remove ${sp.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeSpeaker(sp.id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="roster-hint dim">
          Add each speaker who'll take the floor. Tap a name to mark who's
          speaking now.
        </p>
      )}
    </div>
  )
}
