import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { useSessionStore } from '../store'
import { computeOverview, computeSpeakerReport } from '../analytics'
import type { SpeakerReport } from '../analytics'

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
  const speakers = useSessionStore((s) => s.speakers)
  const sessionStartAt = useSessionStore((s) => s.sessionStartAt)
  const sessionEndAt = useSessionStore((s) => s.sessionEndAt)
  const closeReport = useSessionStore((s) => s.closeReport)

  const overview = useMemo(
    () => computeOverview(speakers, sessionStartAt, sessionEndAt),
    [speakers, sessionStartAt, sessionEndAt]
  )
  const speakerReports = useMemo(
    () => speakers.map(computeSpeakerReport),
    [speakers]
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
      link.download = `ah-counter-session-${stamp}.png`
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
                  {overview.speakerCount} speaker
                  {overview.speakerCount === 1 ? '' : 's'} ·{' '}
                  {overview.totalFillers} filler
                  {overview.totalFillers === 1 ? '' : 's'}
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

            {/* Overview strip */}
            <div className="report-metrics">
              <Metric label="Speakers" value={String(overview.speakerCount)} />
              <Metric label="Total fillers" value={String(overview.totalFillers)} />
              <Metric label="Meeting" value={formatDuration(overview.sessionSec)} />
              <Metric
                label="Cleanest"
                value={overview.cleanestName ?? '—'}
              />
            </div>

            {overview.mostName ? (
              <p className="report-summary">
                Most fillers this session: <strong>{overview.mostName}</strong>.
                Cleanest floor: <strong>{overview.cleanestName ?? '—'}</strong>.
              </p>
            ) : null}

            {/* Per-speaker sections */}
            <div className="report-speakers">
              {speakerReports.map((r) => (
                <SpeakerSection key={r.id} report={r} />
              ))}
            </div>

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

function SpeakerSection({ report }: { report: SpeakerReport }) {
  const maxCount = report.perWord[0]?.count ?? 1
  return (
    <div className="report-speaker">
      <div className="report-speaker-head">
        <span className="report-speaker-name">{report.name}</span>
        <span className="report-speaker-stats">
          {report.totalFillers} total · {report.fillersPerMin}/min ·{' '}
          {formatDuration(report.speakingSec)}
          {report.manualCount > 0 ? ` · ${report.manualCount} manual` : ''}
        </span>
      </div>

      {report.summary ? (
        <p className="report-speaker-summary">{report.summary}</p>
      ) : null}

      {report.perWord.length > 0 ? (
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
                      width: `${(w.count / maxCount) * 100}%`,
                      background: `hsl(${hue} 70% 45% / 0.85)`,
                    }}
                  />
                </span>
                <span className="report-word-count">{w.count}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="dim report-speaker-empty">No fillers — clean run.</p>
      )}
    </div>
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
