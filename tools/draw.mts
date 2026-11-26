// Shared by the generators under tools/: lays rows built by the mod's own planRow() and agentsRow() out as SVG.
// The steps and agents are samples. The colors stand in for theme keys, which only a live surface resolves.
import { agentsRow, cells, planRow } from '../plugin/hooks/rows.ts'
import type { Span } from '../plugin/hooks/rows.ts'

export const PANEL = '#262624'
const COLOR: Record<string, string> = {
  text: '#e8e6e3',
  dim: '#9b9993',
  success: '#4eba65',
  claude: '#d77757',
}

const NOW = Date.UTC(2026, 10, 25, 12)
const STEPS = [
  { content: 'read the code', status: 'completed' },
  { content: 'find the cause', status: 'completed' },
  { content: 'write the fix', status: 'in_progress', startedAt: NOW - 4 * 60_000 },
  { content: 'run the tests', status: 'pending' },
  { content: 'update the docs', status: 'pending' },
] as const
const AGENTS = [
  { id: 'a1', type: 'general-purpose', description: 'review the diff', label: '', status: 'waiting', startTime: NOW - 5 * 60_000 },
  { id: 'a2', type: 'Explore', description: 'map the hooks', label: '', status: 'running', startTime: NOW - 3 * 60_000 },
]

export const sample = (cols: number): { plan: Span[]; agents: Span[] } => ({
  plan: planRow(STEPS, true, cols, NOW),
  agents: agentsRow(AGENTS, NOW, cols),
})

export const columns = (spans: readonly Span[]) => spans.reduce((n, [text]) => n + cells(text), 0)

type Place = { x: number; y: number; cell: number; size: number }

const n = (v: number) => +v.toFixed(1)
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// The three marks are drawn as shapes: a reader's font may have no glyph for them, and a missing one draws a box.
const mark = (ch: string, x: number, { y, cell, size }: Place, fill: string) => {
  const cy = y - size * 0.34
  const h = size * 0.62
  const w = cell * (ch === '▶' ? 0.8 : 0.5)
  const x0 = x + (cell - w) / 2
  if (ch === '▶') {
    return `<polygon points="${n(x0 + w * 0.1)},${n(cy - h / 2)} ${n(x0 + w * 0.9)},${n(cy)} ${n(x0 + w * 0.1)},${n(cy + h / 2)}" fill="${fill}"/>`
  }
  const stroke = Math.max(1, cell * 0.12)
  const inset = ch === '▮' ? 0 : stroke / 2
  const box = `x="${n(x0 + inset)}" y="${n(cy - h / 2 + inset)}" width="${n(w - inset * 2)}" height="${n(h - inset * 2)}"`
  return ch === '▮'
    ? `<rect ${box} fill="${fill}"/>`
    : `<rect ${box} fill="none" stroke="${fill}" stroke-width="${n(stroke)}"/>`
}

// One cell a character, each run of text held to its cells with textLength: the fonts a reader has differ in width.
export const row = (spans: readonly Span[], at: Place) => {
  const out: string[] = []
  let col = 0
  for (const [text, style = {}] of spans) {
    const fill = COLOR[style.color ?? (style.dimColor ? 'dim' : 'text')]
    if (fill === undefined) throw new Error(`no literal for the theme key "${style.color}": add it to COLOR`)
    const weight = style.weight === 'semibold' ? ' font-weight="600"' : ''
    for (const run of text.split(/([▮▯▶])/)) {
      if (run === '') continue
      const x = at.x + col * at.cell
      const word = run.trim()
      if (run === '▮' || run === '▯' || run === '▶') out.push(mark(run, x, at, fill))
      else if (word !== '') {
        const lead = run.length - run.trimStart().length
        out.push(
          `<text x="${n(x + lead * at.cell)}" y="${at.y}" textLength="${n(cells(word) * at.cell)}" fill="${fill}"${weight}>${escape(word)}</text>`,
        )
      }
      col += cells(run)
    }
  }
  return out.join('\n')
}
