import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { useSessionStore } from '../store'
import { computeMatrix, computeOverview, computeSpeakerReport } from '../analytics'
import type { SpeakerReport } from '../analytics'
import { ReportMatrix } from './ReportMatrix'

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.6
const ZOOM_STEP = 0.1

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
  const matrix = useMemo(() => computeMatrix(speakers), [speakers])

  const cardRef = useRef<HTMLDivElement | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'error'>(
    'idle'
  )
  const [view, setView] = useState<'table' | 'list'>('table')
  const [pivoted, setPivoted] = useState(false)
  const [zoom, setZoom] = useState(1)

  const handleSavePng = async () => {
    const node = cardRef.current
    if (!node) return
    setExportState('exporting')
    try {
      // The card scrolls, so a plain capture stops at the visible box and the
      // bottom of a long report is silently missing from the PNG. Measure the
      // full scroll extent and tell html-to-image to render the clone
      // unclipped at that size — the export is then complete at any zoom.
      const width = Math.ceil(node.scrollWidth)
      const height = Math.ceil(node.scrollHeight)
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(node).backgroundColor || undefined,
        width,
        height,
        style: {
          maxHeight: 'none',
          height: `${height}px`,
          width: `${width}px`,
          overflow: 'visible',
        },
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
            style={{ '--report-zoom': zoom } as React.CSSProperties}
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
                label="Cleanest speaker"
                value={overview.cleanestName ?? '—'}
              />
            </div>

            {overview.mostName ? (
              <p className="report-summary">
                Speaker with most fillers this session:{' '}
                <strong>{overview.mostName}</strong>. Cleanest speaker on the
                floor: <strong>{overview.cleanestName ?? '—'}</strong>.
              </p>
            ) : null}

            <div className="report-toolbar">
              <div className="report-seg" role="group" aria-label="Report view">
                <button
                  type="button"
                  className={`report-seg-btn${view === 'table' ? ' on' : ''}`}
                  onClick={() => setView('table')}
                  aria-pressed={view === 'table'}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={`report-seg-btn${view === 'list' ? ' on' : ''}`}
                  onClick={() => setView('list')}
                  aria-pressed={view === 'list'}
                >
                  Per speaker
                </button>
              </div>

              {view === 'table' ? (
                <button
                  type="button"
                  className="footer-btn"
                  onClick={() => setPivoted((p) => !p)}
                  title="Swap rows and columns"
                >
                  Pivot: {pivoted ? 'words as rows' : 'speakers as rows'}
                </button>
              ) : null}

              <div className="report-zoom" role="group" aria-label="Zoom">
                <button
                  type="button"
                  className="footer-btn"
                  onClick={() =>
                    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
                  }
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  className="footer-btn report-zoom-value"
                  onClick={() => setZoom(1)}
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="footer-btn"
                  onClick={() =>
                    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
                  }
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </div>

            {view === 'table' ? (
              <ReportMatrix matrix={matrix} pivoted={pivoted} />
            ) : (
              <div className="report-speakers">
                {speakerReports.map((r) => (
                  <SpeakerSection key={r.id} report={r} />
                ))}
              </div>
            )}

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
          {report.totalFillers} total ({report.soundTotal} sound ·{' '}
          {report.crutchTotal} words) · {report.fillersPerMin}/min ·{' '}
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
