import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { useSessionStore } from '../store'
import { computeReport } from '../analytics'

// Same deterministic hue as BubblesPane so the report visually ties back
// to what the user just saw during the session.
function hueFor(word: string): number {
  let hash = 0
  for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function SessionReport() {
  const showReport = useSessionStore((s) => s.showReport)
  const transcript = useSessionStore((s) => s.transcript)
  const detections = useSessionStore((s) => s.detectionLog)
  const counts = useSessionStore((s) => s.counts)
  const sessionStartAt = useSessionStore((s) => s.sessionStartAt)
  const sessionEndAt = useSessionStore((s) => s.sessionEndAt)
  const speakerName = useSessionStore((s) => s.speakerName)
  const closeReport = useSessionStore((s) => s.closeReport)
  const startPracticeMode = useSessionStore((s) => s.startPracticeMode)

  const report = useMemo(
    () =>
      computeReport({
        transcript,
        detections,
        counts,
        sessionStartAt,
        sessionEndAt,
      }),
    [transcript, detections, counts, sessionStartAt, sessionEndAt]
  )

  const cardRef = useRef<HTMLDivElement | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'error'>(
    'idle'
  )

  const handleSavePng = async () => {
    const node = cardRef.current
    if (!node) return
    setExportState('exporting')
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#0d0f14',
      })
      const link = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      link.download = `ah-counter-${speakerName || 'speaker'}-${stamp}.png`
      link.href = dataUrl
      link.click()
      setExportState('idle')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ah-counter] PNG export failed', err)
      setExportState('error')
      setTimeout(() => setExportState('idle'), 2000)
    }
  }

  const handlePracticeTop = () => {
    if (!report.topCrutch) return
    startPracticeMode(report.topCrutch)
  }

  return (
    <AnimatePresence>
      {showReport ? (
        <motion.div
          className="report-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeReport}
        >
          <motion.div
            className="report-card"
            ref={cardRef}
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="report-header">
              <div>
                <div className="report-eyebrow">Session report</div>
                <h2 className="report-title">
                  {speakerName ? `${speakerName}'s session` : 'This session'}
                </h2>
              </div>
              <button
                type="button"
                className="report-close"
                onClick={closeReport}
                aria-label="Close report"
              >
                ×
              </button>
            </div>

            <div className="report-headline">
              <div className="report-headline-num">{report.totalFillers}</div>
              <div className="report-headline-label">
                filler{report.totalFillers === 1 ? '' : 's'} in{' '}
                {formatDuration(report.durationSec)}
              </div>
            </div>

            <div className="report-metrics">
              <Metric label="Fillers / min" value={report.fillersPerMin.toString()} />
              <Metric label="Words / min" value={report.wordsPerMin.toString()} />
              <Metric
                label="Longest clean streak"
                value={
                  report.longestCleanStreakWords > 0
                    ? `${report.longestCleanStreakWords} words`
                    : '—'
                }
              />
              <Metric
                label="Filler rate"
                value={
                  report.fillerRate > 0
                    ? `${(report.fillerRate * 100).toFixed(1)}%`
                    : '—'
                }
              />
            </div>

            {report.summary ? (
              <p className="report-summary">{report.summary}</p>
            ) : null}

            {report.perWord.length > 0 ? (
              <div className="report-words">
                <div className="report-section-label">By word</div>
                <ul className="report-word-list">
                  {report.perWord.map((w) => {
                    const hue = hueFor(w.word)
                    return (
                      <li key={w.word} className="report-word-row">
                        <span
                          className="report-word-pill"
                          style={{
                            color: `hsl(${hue} 90% 78%)`,
                            borderColor: `hsl(${hue} 80% 60% / 0.5)`,
                          }}
                        >
                          {w.word}
                        </span>
                        <span className="report-word-bar-wrap">
                          <span
                            className="report-word-bar"
                            style={{
                              width: `${
                                (w.count / report.perWord[0].count) * 100
                              }%`,
                              background: `hsl(${hue} 70% 45% / 0.85)`,
                            }}
                          />
                        </span>
                        <span className="report-word-count">{w.count}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            <div className="report-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSavePng}
                disabled={exportState === 'exporting'}
              >
                {exportState === 'exporting'
                  ? 'Rendering…'
                  : exportState === 'error'
                    ? 'Export failed'
                    : 'Save as PNG'}
              </button>
              {report.topCrutch ? (
                <button
                  type="button"
                  className="btn btn-start"
                  onClick={handlePracticeTop}
                >
                  Practice `{report.topCrutch}`
                </button>
              ) : null}
            </div>

            <div className="report-footer">
              Session-only · nothing was stored or uploaded.
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-metric">
      <div className="report-metric-value">{value}</div>
      <div className="report-metric-label">{label}</div>
    </div>
  )
}
