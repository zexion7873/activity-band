// Usage: node tools/make-icon.mts | rsvg-convert -o plugin/.claude-plugin/icon.png
// The marketplace takes the listing icon only from the first save or submission; a later change does not reach it.
import { columns, row, sample } from './draw.mts'

const SIZE = 1024
const BG = '#1c2230'
const CELL = 150

// The plan row's marks alone, then its step in progress as the mark and a bar standing for the text.
const { plan } = sample(100)
const marks = plan.filter(([text]) => text === '▰' || text === '▱')
const current = plan.filter(([text]) => text.includes('▶')).map(([, style]): [string, typeof style] => ['▶', style])
const x = (SIZE - columns(marks) * CELL) / 2

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
${row(marks, { x, y: 480, cell: CELL, size: 260 })}
${row(current, { x, y: 730, cell: CELL, size: 200 })}
<rect x="${x + CELL + 20}" y="${730 - 200 * 0.34 - 26}" width="${(columns(marks) - 1) * CELL - 35}" height="52" rx="26" fill="#e8e6e3"/>
</svg>
`)
