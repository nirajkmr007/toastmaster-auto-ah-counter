import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'
import { useSessionStore, selectActiveSpeaker } from '../store'
import type { FillerKind } from '../detection/detector'

function hueFor(word: string): number {
  let hash = 0
  for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

interface FillerPaneProps {
  kind: FillerKind
}

export function FillerPane({ kind }: FillerPaneProps) {
  const active = useSessionStore(selectActiveSpeaker)
  const addManualDetection = useSessionStore((s) => s.addManualDetection)
  const decrementDetection = useSessionStore((s) => s.decrementDetection)
  const clearDetection = useSessionStore((s) => s.clearDetection)

  const isSound = kind === 'sound'
  const title = isSound ? 'Sound fillers' : 'Crutch words'
  const counts = (isSound ? active?.soundCounts : active?.crutchCounts) ?? {}
  const detectionLog = (active?.detectionLog ?? []).filter((d) => d.kind === kind)

  const bubbles = useMemo(
    () =>
      Object.entries(counts)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count),
    [counts]
  )
  const lastWord = detectionLog[detectionLog.length - 1]?.word ?? null
  const total = bubbles.reduce((s, b) => s + b.count, 0)

  if (!active) {
    return (
      <div className="pane filler-pane">
        <div className="pane-header">
          <h2>{title}</h2>
        </div>
        <div className="empty-state">
          <p className="dim">Add a speaker to start counting.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pane filler-pane">
      <div className="pane-header">
        <h2>{title}</h2>
        <div className="total-counter">
          <span className="total-number">{total}</span>
          <span className="total-label">{active.name}</span>
        </div>
      </div>

      <div className="bubbles-scroll">
        {bubbles.length === 0 ? (
          <div className="empty-state">
            <p className="dim">
              {isSound
                ? 'No sound fillers yet — um, uh, er…'
                : 'No crutch words yet — so, like, actually…'}
            </p>
          </div>
        ) : (
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
                    <button
                      type="button"
                      className="bubble-step"
                      onClick={() => decrementDetection(b.word, kind)}
                      aria-label={`Decrease ${b.word}`}
                      title="Remove one (miscounted)"
                    >
                      −
                    </button>
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
                    <button
                      type="button"
                      className="bubble-step"
                      onClick={() => addManualDetection(b.word, kind)}
                      aria-label={`Increase ${b.word}`}
                      title="Add one"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="bubble-close"
                      onClick={() => clearDetection(b.word, kind)}
                      aria-label={`Clear all ${b.word}`}
                      title="Clear this word entirely"
                    >
                      ×
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
