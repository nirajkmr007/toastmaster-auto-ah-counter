import type { MatrixReport } from '../analytics'

/**
 * Speakers x words heat-map table.
 *
 * Pivoting swaps the axes rather than re-computing anything — which layout
 * reads better depends entirely on the meeting (three speakers with twenty
 * filler words wants the opposite orientation from twenty speakers with three),
 * so the choice belongs to the user, not to a heuristic.
 */

/**
 * Heat colour for a count, on a green -> amber -> red ramp.
 *
 * The scale is sqrt rather than linear: filler counts are heavily skewed (one
 * "um" at 30, everything else at 1-3), and a linear ramp renders every cell but
 * the worst one the same pale nothing. sqrt keeps the small counts visible
 * while still separating the top.
 *
 * Text flips to white only on the saturated end, so the cell stays readable in
 * light, dark and warm themes alike.
 */
function heat(count: number, max: number): React.CSSProperties {
  if (count <= 0) return {}
  const t = max > 1 ? Math.sqrt(count / max) : 1
  const hue = 145 - t * 137 // 145 green -> 8 red
  const alpha = 0.14 + t * 0.58
  return {
    background: `hsl(${hue} 72% 45% / ${alpha})`,
    color: t >= 0.55 ? '#fff' : 'var(--text-h)',
    fontWeight: t >= 0.55 ? 600 : 500,
  }
}

interface Props {
  matrix: MatrixReport
  /** false: speakers as rows. true: words as rows. */
  pivoted: boolean
}

/*
 * A note on keys: every key below is index-based, not label-based.
 *
 * Labels are not unique — two speakers can share a name — and duplicate keys
 * break React's reconciliation outright: switching orientation left stale cells
 * from the previous render trailing past the Total column. Indices are stable
 * within a render and unique by construction, and the orientation switch
 * rebuilds the table anyway, so there is nothing for keys to preserve.
 */
export function ReportMatrix({ matrix, pivoted }: Props) {
  const { speakers, words, counts, speakerTotals, wordTotals, grandTotal, max } =
    matrix

  if (speakers.length === 0 || words.length === 0) {
    return (
      <p className="dim report-speaker-empty">
        No fillers counted — nothing to chart.
      </p>
    )
  }

  const rowLabels = pivoted ? words : speakers.map((s) => s.name)
  const colLabels = pivoted ? speakers.map((s) => s.name) : words
  const rowTotals = pivoted ? wordTotals : speakerTotals
  const colTotals = pivoted ? speakerTotals : wordTotals
  const at = (r: number, c: number) =>
    pivoted ? counts[c][r] : counts[r][c]

  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th className="matrix-corner" scope="col">
              {pivoted ? 'Filler' : 'Speaker'}
            </th>
            {colLabels.map((label, i) => (
              <th key={i} scope="col" className="matrix-col-head">
                <span>{label}</span>
              </th>
            ))}
            <th scope="col" className="matrix-total-head">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((label, r) => (
            <tr key={r}>
              <th scope="row" className="matrix-row-head">
                {label}
              </th>
              {colLabels.map((col, c) => {
                const n = at(r, c)
                return (
                  <td
                    key={c}
                    className={n > 0 ? 'matrix-cell' : 'matrix-cell matrix-zero'}
                    style={heat(n, max)}
                    title={
                      pivoted
                        ? `${col}: ${label} x${n}`
                        : `${label}: ${col} x${n}`
                    }
                  >
                    {n > 0 ? n : '·'}
                  </td>
                )
              })}
              <td className="matrix-cell matrix-total">{rowTotals[r]}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="matrix-row-head">
              Total
            </th>
            {colTotals.map((n, i) => (
              <td key={i} className="matrix-cell matrix-total">
                {n}
              </td>
            ))}
            <td className="matrix-cell matrix-total matrix-grand">
              {grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="matrix-legend">
        <span className="dim">Fewer</span>
        <span className="matrix-legend-ramp" aria-hidden="true" />
        <span className="dim">More</span>
        <span className="dim matrix-legend-note">
          shade is per-cell count, scaled to the busiest cell ({max})
        </span>
      </div>
    </div>
  )
}
