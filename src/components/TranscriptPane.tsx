import { useEffect, useMemo, useRef } from 'react'
import { useSessionStore, selectActiveSpeaker } from '../store'

export function TranscriptPane() {
  const active = useSessionStore(selectActiveSpeaker)
  const removeDetectionById = useSessionStore((s) => s.removeDetectionById)
  const transcript = active?.transcript ?? []
  const partialText = active?.partialText ?? ''
  const detectionLog = active?.detectionLog

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Per line: token index -> the crutch detection covering it. A phrase covers
  // several indices; all point at the same detection id.
  const hitsByLine = useMemo(() => {
    const m = new Map<string, Map<number, { id: string; word: string }>>()
    for (const d of detectionLog ?? []) {
      if (d.kind !== 'crutch' || d.lineId == null || d.pos == null) continue
      let lm = m.get(d.lineId)
      if (!lm) {
        lm = new Map()
        m.set(d.lineId, lm)
      }
      const len = d.len ?? 1
      for (let i = 0; i < len; i++) lm.set(d.pos + i, { id: d.id, word: d.word })
    }
    return m
  }, [detectionLog])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 80) el.scrollTop = el.scrollHeight
  }, [transcript, partialText])

  return (
    <div className="pane transcript-pane" data-tour="transcript">
      <div className="pane-header">
        <h2>Transcript</h2>
        {active ? <span className="speaker-tag">{active.name}</span> : null}
      </div>

      <div className="transcript-scroll" ref={scrollRef}>
        {!active ? (
          <p className="empty-state dim">Add a speaker to begin.</p>
        ) : transcript.length === 0 && !partialText ? (
          <p className="empty-state dim">
            Transcript will appear here. Counted crutch words are highlighted —
            click one to dismiss a false positive.
          </p>
        ) : (
          <>
            {transcript.map((line) => {
              const lm = hitsByLine.get(line.id)
              const words = line.text.split(/\s+/)
              return (
                <p key={line.id} className="transcript-line">
                  {words.map((w, i) => {
                    const hit = lm?.get(i)
                    if (!hit) return <span key={i}>{w} </span>
                    return (
                      <span key={i}>
                        <button
                          type="button"
                          className="tx-hit"
                          onClick={() => removeDetectionById(hit.id)}
                          title="Counted as a crutch word — click to dismiss (−1)"
                        >
                          {w}
                        </button>{' '}
                      </span>
                    )
                  })}
                </p>
              )
            })}
            {partialText ? (
              <p className="transcript-line partial">{partialText}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
