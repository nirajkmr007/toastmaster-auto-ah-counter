import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'
import { useSessionStore, selectActiveSpeaker } from '../store'
import { manualAddWords } from '../detection/detector'

// Deterministic hue per word so the same filler always gets the same color.
function hueFor(word: string): number {
  let hash = 0
  for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

export function BubblesPane() {
  const active = useSessionStore(selectActiveSpeaker)
  const wordList = useSessionStore((s) => s.wordList)
  const addManualDetection = useSessionStore((s) => s.addManualDetection)

  const counts = active?.counts ?? {}
  const detectionLog = active?.detectionLog ?? []

  const bubbles = useMemo(
    () =>
      Object.entries(counts)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count),
    [counts]
  )

  const lastWord = detectionLog[detectionLog.length - 1]?.word ?? null
  const total = bubbles.reduce((s, b) => s + b.count, 0)
  const logTail = detectionLog.slice(-12).reverse()
  const manualButtons = useMemo(() => manualAddWords(wordList), [wordList])

  if (!active) {
    return (
      <div className="pane bubbles-pane">
        <div className="pane-header">
          <h2>Fillers</h2>
        </div>
        <div className="empty-state">
          <p>No speaker selected.</p>
          <p className="dim">Add a speaker to start counting.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pane bubbles-pane">
      <div className="pane-header">
        <h2>Fillers</h2>
        <div className="total-counter">
          <span className="total-number">{total}</span>
          <span className="total-label">{active.name}</span>
        </div>
      </div>

      <div className="bubbles-scroll">
        {bubbles.length === 0 ? (
          <div className="empty-state">
            <p>No fillers caught yet.</p>
            <p className="dim">
              Speak, or tap a word below to add one manually.
            </p>
          </div>
        ) : (
          <>
            <div className="bubbles-grid">
              <AnimatePresence>
                {bubbles.map((b) => {
                  const hue = hueFor(b.word)
                  const isPulsing = b.word === lastWord
                  return (
                    <motion.div
                      key={b.word}
                      layout
                      className="bubble"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      style={{
                        background: `hsl(${hue} 70% 22% / 0.9)`,
                        borderColor: `hsl(${hue} 80% 60% / 0.7)`,
                        color: `hsl(${hue} 90% 85%)`,
                      }}
                    >
                      <motion.span
                        className="bubble-count"
                        key={b.count}
                        initial={{ scale: isPulsing ? 1.5 : 1 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                      >
                        {b.count}
                      </motion.span>
                      <span className="bubble-word">{b.word}</span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>

            {logTail.length > 0 ? (
              <div className="detection-log">
                <div className="log-header">
                  <span className="log-title">Recent</span>
                </div>
                <ul className="log-list">
                  {logTail.map((d) => {
                    const hue = hueFor(d.word)
                    return (
                      <li key={d.id} className="log-item">
                        <span
                          className="log-word"
                          style={{
                            color: `hsl(${hue} 90% 78%)`,
                            borderColor: `hsl(${hue} 80% 60% / 0.5)`,
                          }}
                        >
                          {d.word}
                        </span>
                        <span className="log-context">
                          {d.manual ? 'added manually' : `…${d.context}…`}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Manual add — the human ah-counter's override for anything the model
          missed. Attributes to the active speaker. */}
      <div className="manual-add">
        <div className="manual-add-label">
          Tap to add for <strong>{active.name}</strong>
        </div>
        <div className="manual-add-buttons">
          {manualButtons.map((w) => (
            <button
              key={w}
              type="button"
              className="manual-btn"
              onClick={() => addManualDetection(w)}
              style={{ borderColor: `hsl(${hueFor(w)} 80% 60% / 0.5)` }}
            >
              +{w}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
