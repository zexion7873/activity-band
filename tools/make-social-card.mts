// Usage: node tools/make-social-card.mts | rsvg-convert -o docs/social-card.png
// The text is plugin.json's description, so editing it stales the card.
// GitHub has no API for the social preview: the PNG is uploaded by hand at Settings → General → Social preview.
import { readFileSync } from 'node:fs'

import { PANEL, row, sample } from './draw.mts'

const plugin = JSON.parse(readFileSync(new URL('../plugin/.claude-plugin/plugin.json', import.meta.url), 'utf8'))
const [tagline, accent] = (plugin.description as string).split(': ')
if (accent === undefined) throw new Error('plugin.json description no longer reads "<tagline>: <accent>"')

const W = 1280
const H = 640
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const BG = '#1c2230'
const ACCENT = '#5b8fe0'
const SIZE = 30
const CELL = 18
const X = 96
// Narrower than the hero's rows, so the card shows the mod fitting its agents to the width.
const { plan, agents } = sample(56)

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="${BG}"/>
<text x="${X}" y="196" font-size="92" font-weight="700" fill="#f0f2f5">activity-band</text>
<text x="${X}" y="264" font-size="30" fill="#b8bec9">${tagline}</text>
<text x="${X}" y="312" font-size="30" font-weight="700" fill="${ACCENT}">${accent}</text>
<rect x="${X}" y="368" width="${W - X * 2}" height="150" rx="18" fill="${PANEL}"/>
<g font-family="Menlo, Consolas, monospace" font-size="${SIZE}">
${row(plan, { x: X + 40, y: 432, cell: CELL, size: SIZE })}
${row(agents, { x: X + 40, y: 484, cell: CELL, size: SIZE })}
</g>
<text x="${X}" y="574" font-size="23" fill="#7d8592">Desktop app. No network, no model calls, no files written.</text>
</svg>
`)
