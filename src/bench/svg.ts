// Hand-rolled SVG plots for bench reports: no dependency, legible in light and dark themes (the
// colours are CSS variables swapped by prefers-color-scheme inside the SVG, over its own
// background). Two forms: a line chart (a metric against the threshold, one line per backend),
// and small multiples of horizontal bars (one measure per panel: never two scales on one axis).
// Pure: svg.test.ts checks their structure.

// The dataviz reference palette's categorical order, light and dark steps.
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

// Plain class rules with literal colours, the dark ones under the media query: a viewer that
// knows no CSS variables (an image converter) still draws the light theme.
function style(series: number): string {
  const rules = (steps: string[]) => steps.slice(0, Math.max(1, series)).map((c, i) =>
    `.l${i + 1}{stroke:${c}}.d${i + 1}{fill:${c}}`).join('')
  const theme = (bg: string, ink: string, ink2: string, grid: string, axis: string, steps: string[]) =>
    `.bg{fill:${bg}}.dot{stroke:${bg}}text{fill:${ink}}.st,.ax{fill:${ink2}}.g{stroke:${grid}}.a,.guide{stroke:${axis}}${rules(steps)}`
  return `<style>
text{font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.t{font-size:15px;font-weight:600}.st{font-size:12px}.ax{font-size:11px}.lab{font-size:11px}
.g,.a,.guide{stroke-width:1}.guide{stroke-dasharray:4 4}.fake{font-size:13px;font-weight:700}
${theme('#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df', '#a3a29c', LIGHT)}.fake{fill:#c43534}
@media (prefers-color-scheme: dark){${theme('#1a1a19', '#f0efec', '#c3c2b7', '#353532', '#6b6a64', DARK)}.fake{fill:#e66767}}
</style>`
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (n: number) => Math.round(n * 100) / 100

export type LineSeries = { name: string; points: { x: number; y: number | null }[]; /** A ringed marker here (the recommended threshold). */ mark?: number }

export type LineChart = {
  title: string
  subtitle?: string
  xLabel: string
  yLabel: string
  series: LineSeries[]
  /** Dashed vertical guides, such as the feature's default threshold. */
  guides?: { x: number; label: string }[]
  yMin?: number
  yMax?: number
  /** Show y values as percentages. */
  percent?: boolean
  fake?: boolean
}

function ticks(lo: number, hi: number, n = 5): number[] {
  if (hi <= lo) return [lo]
  const raw = (hi - lo) / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/** A metric against a threshold, one line per series, with a legend and per-point titles. */
export function lineChart(c: LineChart): string {
  const W = 720
  const H = 380
  const L = 64
  const R = 36
  const T = c.fake ? 78 : 60
  const B = 64 + 22 * Math.ceil(c.series.length / 3)
  const xs = c.series.flatMap(s => s.points.map(p => p.x))
  const ysAll = c.series.flatMap(s => s.points.map(p => p.y)).filter((y): y is number => y !== null)
  const x0 = xs.length ? Math.min(...xs) : 0
  const x1 = xs.length ? Math.max(...xs) : 1
  const y0 = c.yMin ?? Math.min(0, ...ysAll)
  const y1 = c.yMax ?? Math.max(1e-9, ...ysAll)
  const fy = (n: number) => (c.percent ? `${Math.round(n * 100)}%` : `${r2(n)}`)
  const px = (x: number) => L + ((x - x0) / Math.max(1e-9, x1 - x0)) * (W - L - R)
  const py = (y: number) => T + (1 - (y - y0) / Math.max(1e-9, y1 - y0)) * (H - T - B)
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(c.title)}">`)
  out.push(`<title>${esc(c.title)}</title>`, style(c.series.length), `<rect width="${W}" height="${H}" rx="8" class="bg"/>`)
  out.push(`<text class="t" x="${L}" y="26">${esc(c.title)}</text>`)
  if (c.subtitle) out.push(`<text class="st" x="${L}" y="44">${esc(c.subtitle)}</text>`)
  if (c.fake) out.push(`<text class="fake" x="${L}" y="${c.subtitle ? 62 : 44}">FAKE BACKEND: example numbers, not a measurement</text>`)
  for (const t of ticks(y0, y1)) {
    out.push(`<line class="g" x1="${L}" x2="${W - R}" y1="${r2(py(t))}" y2="${r2(py(t))}"/>`)
    out.push(`<text class="ax" x="${L - 8}" y="${r2(py(t) + 4)}" text-anchor="end">${fy(t)}</text>`)
  }
  const xt = [...new Set(xs)].sort((a, b) => a - b)
  const every = Math.max(1, Math.ceil(xt.length / 10))
  xt.forEach((t, i) => {
    if (i % every) return
    out.push(`<text class="ax" x="${r2(px(t))}" y="${H - B + 18}" text-anchor="middle">${r2(t)}</text>`)
  })
  out.push(`<line class="a" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`)
  out.push(`<text class="ax" x="${(L + W - R) / 2}" y="${H - B + 36}" text-anchor="middle">${esc(c.xLabel)}</text>`)
  out.push(`<text class="ax" transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(c.yLabel)}</text>`)
  for (const g of c.guides ?? []) {
    if (g.x < x0 || g.x > x1) continue
    out.push(`<line class="guide" x1="${r2(px(g.x))}" x2="${r2(px(g.x))}" y1="${T}" y2="${H - B}"/>`)
    out.push(`<text class="ax" x="${r2(px(g.x) + 4)}" y="${T + 10}">${esc(g.label)}</text>`)
  }
  c.series.forEach((s, i) => {
    const k = (i % LIGHT.length) + 1
    const pts = s.points.filter((p): p is { x: number; y: number } => p.y !== null)
    if (pts.length > 1) {
      out.push(`<polyline class="l${k}" fill="none" stroke-width="2" stroke-linejoin="round" points="${pts.map(p => `${r2(px(p.x))},${r2(py(p.y))}`).join(' ')}"/>`)
    }
    for (const p of pts) {
      out.push(`<circle class="d${k} dot" cx="${r2(px(p.x))}" cy="${r2(py(p.y))}" r="4" stroke-width="2"><title>${esc(s.name)}: ${r2(p.x)} → ${fy(p.y)}</title></circle>`)
    }
    const m = s.mark === undefined ? undefined : pts.find(p => Math.abs(p.x - s.mark!) < 1e-9)
    if (m) out.push(`<circle class="l${k}" cx="${r2(px(m.x))}" cy="${r2(py(m.y))}" r="8" fill="none" stroke-width="2"><title>${esc(s.name)}: recommended ${r2(m.x)}</title></circle>`)
  })
  c.series.forEach((s, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = L + col * 220
    const y = H - B + 56 + row * 22
    out.push(`<line x1="${x}" x2="${x + 18}" y1="${y - 4}" y2="${y - 4}" class="l${(i % LIGHT.length) + 1}" stroke-width="3"/>`)
    out.push(`<text class="lab" x="${x + 24}" y="${y}">${esc(s.name.length > 30 ? s.name.slice(0, 29) + '…' : s.name)}</text>`)
  })
  out.push('</svg>')
  return out.join('\n')
}

export type BarPanel = { title: string; rows: { label: string; value: number | null }[]; format: (n: number) => string }

/** Small multiples of horizontal bars: one measure per panel, rows in the same order in each. */
export function barPanels(c: { title: string; subtitle?: string; panels: BarPanel[]; fake?: boolean }): string {
  const labels = c.panels[0]?.rows.map(r => r.label) ?? []
  const W = 720
  const labelW = 170
  const panelW = (W - labelW - 24) / Math.max(1, c.panels.length)
  const T = c.fake ? 96 : 78
  const rowH = 26
  const H = T + rowH * labels.length + 24
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(c.title)}">`)
  out.push(`<title>${esc(c.title)}</title>`, style(1), `<rect width="${W}" height="${H}" rx="8" class="bg"/>`)
  out.push(`<text class="t" x="16" y="26">${esc(c.title)}</text>`)
  if (c.subtitle) out.push(`<text class="st" x="16" y="44">${esc(c.subtitle)}</text>`)
  if (c.fake) out.push(`<text class="fake" x="16" y="${c.subtitle ? 62 : 44}">FAKE BACKEND: example numbers, not a measurement</text>`)
  labels.forEach((label, i) => {
    const short = label.length > 26 ? label.slice(0, 25) + '…' : label
    out.push(`<text class="lab" x="${labelW - 8}" y="${T + i * rowH + 17}" text-anchor="end">${esc(short)}</text>`)
  })
  c.panels.forEach((p, k) => {
    const x = labelW + k * panelW
    const max = Math.max(1e-12, ...p.rows.map(r => r.value ?? 0))
    out.push(`<text class="ax" x="${x + 4}" y="${T - 10}">${esc(p.title)}</text>`)
    out.push(`<line class="a" x1="${x}" x2="${x}" y1="${T - 4}" y2="${T + rowH * labels.length}"/>`)
    p.rows.forEach((r, i) => {
      const y = T + i * rowH + 5
      if (r.value === null) { out.push(`<text class="ax" x="${x + 6}" y="${y + 12}">n/a</text>`); return }
      const w = Math.max(2, (r.value / max) * (panelW - 70))
      out.push(`<rect x="${x}" y="${y}" width="${r2(w)}" height="16" rx="3" class="d1"><title>${esc(r.label)}: ${esc(p.format(r.value))}</title></rect>`)
      out.push(`<text class="lab" x="${r2(x + w + 4)}" y="${y + 12}">${esc(p.format(r.value))}</text>`)
    })
  })
  out.push('</svg>')
  return out.join('\n')
}
