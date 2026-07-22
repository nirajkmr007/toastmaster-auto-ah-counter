import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store'

export function TranscriptPane() {
  const transcript = useSessionStore((s) => s.transcript)
  const partialText = useSessionStore((s) => s.partialText)
  const speakerName = useSessionStore((s) => s.speakerName)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [transcript, partialText])

  return (
    <div className="pane transcript-pane">
      <div className="pane-header">
        <h2>Transcript</h2>
        {speakerName ? <span className="speaker-tag">{speakerName}</span> : null}
      </div>

      <div className="transcript-scroll" ref={scrollRef}>
        {transcript.length === 0 && !partialText ? (
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
