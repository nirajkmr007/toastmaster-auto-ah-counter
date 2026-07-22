import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'
import { useSessionStore } from '../store'

// Deterministic hue per word so the same filler always gets the same color.
function hueFor(word: string): number {
  let hash = 0
  for (let i = 0; i < word.length; i++) {
    hash = (hash * 31 + word.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

export function BubblesPane() {
  const counts = useSessionStore((s) => s.counts)
  const recentDetections = useSessionStore((s) => s.recentDetections)

  const bubbles = useMemo(() => {
    return Object.entries(counts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
  }, [counts])

  // Most recent detection's word — used to trigger a pulse animation.
  const lastWord = recentDetections[recentDetections.length - 1]?.word ?? null

  const total = bubbles.reduce((s, b) => s + b.count, 0)

  return (
    <div className="pane bubbles-pane">
      <div className="pane-header">
        <h2>Fillers</h2>
        <div className="total-counter">
          <span className="total-number">{total}</span>
          <span className="total-label">total</span>
        </div>
      </div>

      {bubbles.length === 0 ? (
        <div className="empty-state">
          <p>No fillers caught yet.</p>
          <p className="dim">Speak into your mic — bubbles will appear here.</p>
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
      )}
    </div>
  )
}
