import type { TextProps } from 'claude-code'

import type { ActivityAgent, PlanStep } from '../types'

// The cells a description or a next step needs before it is worth a place on the row.
const MIN_TEXT = 12
export const SEP = ' · '
const MARK = { completed: '☑', in_progress: '▶', pending: '☐' } as const
const PAUSE = '‖'
const DIM: TextProps = { dimColor: true }

export type Span = [text: string, style?: TextProps]

const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u
const width = (ch: string) => (WIDE.test(ch) ? 2 : 1)
export const cells = (s: string) => [...s].reduce((n, ch) => n + width(ch), 0)

// Cuts to `max` cells with the ellipsis counted: a CJK character takes two, so cutting by length overflows the row.
export const clip = (s: string, max: number) => {
  if (cells(s) <= max) return s
  let out = ''
  let n = 0
  for (const ch of s) {
    if (n + width(ch) > max - 1) break
    out += ch
    n += width(ch)
  }
  return `${out.trimEnd()}…`
}

export const elapsed = (now: number, startTime: number) => {
  const minutes = Math.floor((now - startTime) / 60_000)
  return minutes < 1 ? '<1m' : `${minutes}m`
}

const tail = (a: ActivityAgent, now: number) =>
  a.status === 'running' ? elapsed(now, a.startTime) : `${a.status} ${elapsed(now, a.startTime)}`

export const statusStyle = (a: ActivityAgent): TextProps => (a.status === 'waiting' ? { color: 'warning' } : DIM)

export const planRow = (steps: readonly PlanStep[], isWorking: boolean, cols: number): Span[] => {
  const tone = (color: string): TextProps => (isWorking ? { color } : DIM)
  const current = steps.find(s => s.status === 'in_progress')
  const count = ` ${steps.filter(s => s.status === 'completed').length}/${steps.length}`
  const row: Span[] = [
    ['plan ', DIM],
    ...steps.map((s): Span => (s.status === 'completed' ? ['▰', tone('success')] : ['▱', s === current ? tone('claude') : DIM])),
    [count, { dimColor: true, tabular: true }],
  ]
  if (current === undefined) return row

  const room = cols - 'plan '.length - steps.length - count.length - 3
  const label = clip(current.content, room)
  row.push([` ${isWorking ? MARK.in_progress : PAUSE} `, tone('claude')], [label, isWorking ? { weight: 'semibold' } : DIM])

  const next = steps.slice(steps.indexOf(current) + 1).find(s => s.status === 'pending')
  const nextRoom = room - cells(label) - 3
  if (isWorking && next !== undefined && nextRoom >= MIN_TEXT) row.push([` → ${clip(next.content, nextRoom)}`, DIM])
  return row
}

export const stepLine = (s: PlanStep, isWorking: boolean): Span[] => {
  if (s.status === 'pending' || !isWorking) {
    return [[`${s.status === 'in_progress' ? PAUSE : MARK[s.status]} ${s.content}`, DIM]]
  }
  return s.status === 'completed'
    ? [[MARK.completed, { color: 'success' }], [` ${s.content}`, DIM]]
    : [[MARK.in_progress, { color: 'claude' }], [` ${s.content}`, { weight: 'semibold' }]]
}

export const agentsRow = (list: readonly ActivityAgent[], now: number, cols: number): Span[] => {
  const head = `agents ${list.length} `
  const fixed = list.map(a => cells(`${a.type}: `) + 1 + cells(tail(a, now)))
  const more = (shown: number) => (shown < list.length ? ` +${list.length - shown}` : '')
  const spare = (shown: number) =>
    cols - head.length - more(shown).length - SEP.length * (shown - 1) - fixed.slice(0, shown).reduce((a, b) => a + b, 0)

  let shown = list.length
  while (shown > 1 && spare(shown) < MIN_TEXT * shown) shown -= 1
  const share = Math.floor(spare(shown) / shown)

  const row: Span[] = [[head, { dimColor: true, tabular: true }]]
  list.slice(0, shown).forEach((a, i) => {
    row.push([`${i > 0 ? SEP : ''}${a.type}: ${clip(a.description, share)}`], [` ${tail(a, now)}`, statusStyle(a)])
  })
  if (shown < list.length) row.push([more(shown), DIM])
  return row
}
