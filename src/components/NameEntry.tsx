import { useSessionStore } from '../store'

export function NameEntry() {
  const speakerName = useSessionStore((s) => s.speakerName)
  const setSpeakerName = useSessionStore((s) => s.setSpeakerName)
  const status = useSessionStore((s) => s.status)
  const disabled = status === 'listening' || status === 'loading-model'

  return (
    <label className="name-entry">
      <span className="label">Speaker</span>
      <input
        type="text"
        placeholder="Your name"
        value={speakerName}
        onChange={(e) => setSpeakerName(e.target.value)}
        disabled={disabled}
        maxLength={40}
        autoComplete="off"
      />
    </label>
  )
}
