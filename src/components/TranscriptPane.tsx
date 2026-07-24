import { useEffect, useRef } from 'react'
import { useSessionStore, selectActiveSpeaker } from '../store'

export function TranscriptPane() {
  const active = useSessionStore(selectActiveSpeaker)
  const transcript = active?.transcript ?? []
  const partialText = active?.partialText ?? ''

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to bottom on new content — but only if the user is already
  // near the bottom. If they've scrolled up to re-read, don't yank them down.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 80) el.scrollTop = el.scrollHeight
  }, [transcript, partialText])

  return (
    <div className="pane transcript-pane">
      <div className="pane-header">
        <h2>Transcript</h2>
        {active ? <span className="speaker-tag">{active.name}</span> : null}
      </div>

      <div className="transcript-scroll" ref={scrollRef}>
        {!active ? (
          <p className="empty-state dim">Add a speaker to begin.</p>
        ) : transcript.length === 0 && !partialText ? (
          <p className="empty-state dim">Transcript will appear here as you speak.</p>
        ) : (
          <>
            {transcript.map((line) => (
              <p key={line.id} className="transcript-line">
                {line.text}
              </p>
            ))}
            {partialText ? (
              <p className="transcript-line partial">{partialText}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
