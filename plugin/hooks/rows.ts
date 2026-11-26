import type { TextProps } from 'claude-code'

import type { ActivityAgent, PlanStep } from '../types'

// The cells a description or a next step needs before it is worth a place on the row.
const MIN_TEXT = 12
// A type cut shorter than this names nothing, so it is left out instead.
const MIN_TYPE = 4
export const SEP = ' · '
// ▮ and ▯ come from one font where the app's own has neither; a pair drawn from two fonts differs in size.
const MARK = { completed: '▮', in_progress: '▶', pending: '▯' } as const
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

// The layouts below give way in order of worth; this holds a row to `cols` where even the least of it is too wide.
const fit = (row: Span[], cols: number): Span[] => {
  const out: Span[] = []
  let left = cols
  for (const span of row) {
    if (left < 1) break
    const cut = clip(span[0], left)
    if (cut !== span[0]) {
      out.push([cut, span[1]])
      break
    }
    out.push(span)
    left -= cells(cut)
  }
  return out
}

export const elapsed = (now: number, startTime: number) => {
  const minutes = Math.floor((now - startTime) / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h${minutes % 60 === 0 ? '' : `${minutes % 60}m`}`
}

// `killed` is the engine's word for an agent that was stopped.
const word = (a: ActivityAgent) => (a.status === 'killed' ? 'stopped' : a.status)

// One that ended shows how long it ran, which stands still while it stays on the row.
const time = (a: ActivityAgent, now: number) => elapsed(a.endedAt ?? now, a.startTime)

// The word says what was measured, no request for this long; a long tool call is quiet and healthy.
const QUIET_AFTER = 2 * 60_000
const quiet = (a: ActivityAgent, now: number) =>
  a.quietSince !== undefined && now - a.quietSince >= QUIET_AFTER ? `quiet ${elapsed(now, a.quietSince)}` : undefined

const tail = (a: ActivityAgent, now: number) =>
  a.status === 'running' ? (quiet(a, now) ?? time(a, now)) : `${word(a)} ${time(a, now)}`

// A stop is most often the person's own; only a failure is news in a color.
const statusStyle = (a: ActivityAgent): TextProps => (a.status === 'failed' ? { color: 'error' } : DIM)

export const agentHead = (a: ActivityAgent, now: number): Span[] => {
  const still = quiet(a, now)
  return [
    [word(a), statusStyle(a)],
    [`${SEP}${a.type}: `, DIM],
    [a.description],
    [` ${time(a, now)}${still === undefined ? '' : `${SEP}${still}`}`, DIM],
  ]
}

export const planRow = (steps: readonly PlanStep[], isWorking: boolean, cols: number, now: number): Span[] => {
  const tone = (color: string): TextProps => (isWorking ? { color } : DIM)
  const current = steps.find(s => s.status === 'in_progress')
  const done = steps.filter(s => s.status === 'completed').length
  // Marks past a quarter of the row take the room of the step in progress, and the count already says what they say.
  const marks =
    steps.length * 4 > cols
      ? []
      : steps.map((s): Span =>
          s.status === 'completed' ? [MARK.completed, tone('success')] : [MARK.pending, s.status === 'in_progress' ? tone('claude') : DIM],
        )
  // Beside the marks a count reads as the number of the step after it, so it is written only in their place.
  const count = marks.length > 0 ? '' : `${done}/${steps.length} done`
  const row: Span[] = [['plan ', DIM], ...marks]
  if (count !== '') row.push([count, { dimColor: true, tabular: true }])
  if (current === undefined) {
    // Between two steps a stopped plan differs from a live one by brightness alone without it.
    if (!isWorking && done < steps.length) row.push([` ${PAUSE}`, DIM])
    return fit(row, cols)
  }

  // A paused step is not running, and under a minute the time says nothing a new step does not.
  const since = isWorking ? current.startedAt : undefined
  const ran = since !== undefined && now - since >= 60_000 ? ` ${elapsed(now, since)}` : ''
  const room = cols - 'plan '.length - marks.length - count.length - 3 - ran.length
  const label = clip(current.content, room)
  row.push([` ${isWorking ? MARK.in_progress : PAUSE} `, tone('claude')], [label, isWorking ? { weight: 'semibold' } : DIM])
  if (ran !== '') row.push([ran, DIM])

  const next = steps.slice(steps.indexOf(current) + 1).find(s => s.status === 'pending')
  const nextRoom = room - cells(label) - 3
  if (isWorking && next !== undefined && nextRoom >= MIN_TEXT) row.push([` → ${clip(next.content, nextRoom)}`, DIM])
  return fit(row, cols)
}

export const stepLine = (s: PlanStep, isWorking: boolean): Span[] => {
  if (s.status === 'pending' || !isWorking) {
    return [[`${s.status === 'in_progress' ? PAUSE : MARK[s.status]} ${s.content}`, DIM]]
  }
  return s.status === 'completed'
    ? [[MARK.completed, { color: 'success' }], [` ${s.content}`, DIM]]
    : [[MARK.in_progress, { color: 'claude' }], [` ${s.content}`, { weight: 'semibold' }]]
}

// The engine calls its cost an estimate and asks a mod that shows it to say so.
export const agentFacts = (a: ActivityAgent) =>
  [
    a.contextPercent === undefined ? '' : `context ${a.contextPercent}%`,
    a.model ?? '',
    a.costUsd === undefined ? '' : `est. $${a.costUsd.toFixed(2)}`,
  ]
    .filter(fact => fact !== '')
    .join(SEP)

// Each agent under the one that spawned it; one whose parent is not listed stands at the top.
export const nested = (list: readonly ActivityAgent[]): [agent: ActivityAgent, depth: number][] => {
  const listed = new Set(list.map(a => a.id))
  const under = (parent: string | undefined, depth: number): [ActivityAgent, number][] =>
    list
      .filter(a => (a.parentId !== undefined && listed.has(a.parentId) ? a.parentId : undefined) === parent)
      .flatMap((a): [ActivityAgent, number][] => [[a, depth], ...under(a.id, depth + 1)])
  return under(undefined, 0)
}

export const agentsRow = (list: readonly ActivityAgent[], now: number, cols: number): Span[] => {
  const head = `agents ${list.length} `
  const need = (a: ActivityAgent) => Math.min(cells(a.description), MIN_TEXT)
  const more = (shown: number) => (shown < list.length ? ` +${list.length - shown}` : '')
  // What is left once each agent shown has its type, its tail and the least its description needs.
  const spare = (shown: number) =>
    list
      .slice(0, shown)
      .reduce(
        (left, a) => left - cells(`${a.type}: `) - need(a) - 1 - cells(tail(a, now)),
        cols - head.length - more(shown).length - SEP.length * (shown - 1),
      )

  let shown = list.length
  while (shown > 1 && spare(shown) < 0) shown -= 1
  let extra = spare(shown)

  const row: Span[] = [[head, { dimColor: true, tabular: true }]]
  list.slice(0, shown).forEach((a, i) => {
    // Short of room, which only the last agent left can be, the type is cut and then dropped before the description.
    const typeRoom = cells(a.type) + extra
    const type = typeRoom >= cells(a.type) ? a.type : typeRoom >= MIN_TYPE ? clip(a.type, typeRoom) : ''
    const prefix = type === '' ? '' : `${type}: `
    const room = extra + cells(`${a.type}: `) + need(a) - cells(prefix)
    const description = clip(a.description, room)
    extra = room - cells(description)
    // The description says which agent this is; its type and what parts two agents are dim beside it.
    const lead = `${i > 0 ? SEP : ''}${prefix}`
    if (lead !== '') row.push([lead, DIM])
    row.push([description], [` ${tail(a, now)}`, statusStyle(a)])
  })
  if (shown < list.length) row.push([more(shown), DIM])
  return fit(row, cols)
}
