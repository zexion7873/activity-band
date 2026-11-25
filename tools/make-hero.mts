// Usage: node tools/make-hero.mts [OUT.svg]   (no argument overwrites docs/band.svg)
import { writeFileSync } from 'node:fs'

import { columns, PANEL, row, sample } from './draw.mts'

const out = process.argv[2] ?? new URL('../docs/band.svg', import.meta.url).pathname

const SIZE = 13
const CELL = 8
const PAD = 16
const { plan, agents } = sample(100)

const width = PAD * 2 + Math.max(columns(plan), columns(agents)) * CELL
const height = 64
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${SIZE}">
<rect width="${width}" height="${height}" rx="10" fill="${PANEL}"/>
${row(plan, { x: PAD, y: 27, cell: CELL, size: SIZE })}
${row(agents, { x: PAD, y: 48, cell: CELL, size: SIZE })}
</svg>
`
writeFileSync(out, svg)
console.log(`${out} ${width}x${height}`)
