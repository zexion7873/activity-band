import { atom, read, update } from 'claude-code'
import type { AgentInfo, Register, TextProps } from 'claude-code'

import type { ActivityAgent, PlanStep } from '../types'
import { applyPlan, finishPlan } from './plan'

const plan = atom({ plugin: 'activity-band', key: 'plan' } as const, [] as PlanStep[])
// Change the tag with ActivityAgent: a reload then reads the stored list as empty, not as agents missing a field.
const agents = atom({ plugin: 'activity-band', key: 'agents' } as const, [] as ActivityAgent[], { shape: 'agents-2' })

// The cells a description or a next step needs before it is worth a place on the row.
const MIN_TEXT = 12
const CARD_COLS = 100
const SEP = ' · '
// The engine lists a finished agent until it drops its task; only these are still at work.
const ACTIVE: readonly string[] = ['pending', 'running', 'waiting', 'idle']
const MARK = { completed: '☑', in_progress: '▶', pending: '☐' } as const
const PAUSE = '‖'
const DIM: TextProps = { dimColor: true }

type Span = [text: string, style?: TextProps]

const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u
const width = (ch: string) => (WIDE.test(ch) ? 2 : 1)
const cells = (s: string) => [...s].reduce((n, ch) => n + width(ch), 0)

// Cuts to `max` cells with the ellipsis counted: a CJK character takes two, so cutting by length overflows the row.
const clip = (s: string, max: number) => {
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

const active = (list: readonly AgentInfo[]): ActivityAgent[] =>
  list
    .filter(a => ACTIVE.includes(a.status))
    .map(({ id, type, description, label, status, startTime }) => ({ id, type, description, label, status, startTime }))

const waitingFirst = (list: readonly ActivityAgent[]) =>
  [...list].sort((a, b) => Number(b.status === 'waiting') - Number(a.status === 'waiting'))

const elapsed = (now: number, startTime: number) => {
  const minutes = Math.floor((now - startTime) / 60_000)
  return minutes < 1 ? '<1m' : `${minutes}m`
}

const tail = (a: ActivityAgent, now: number) =>
  a.status === 'running' ? elapsed(now, a.startTime) : `${a.status} ${elapsed(now, a.startTime)}`

const statusStyle = (a: ActivityAgent): TextProps => (a.status === 'waiting' ? { color: 'warning' } : DIM)

const planRow = (steps: readonly PlanStep[], isWorking: boolean, cols: number): Span[] => {
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

const stepLine = (s: PlanStep, isWorking: boolean): Span[] => {
  if (s.status === 'pending' || !isWorking) {
    return [[`${s.status === 'in_progress' ? PAUSE : MARK[s.status]} ${s.content}`, DIM]]
  }
  return s.status === 'completed'
    ? [[MARK.completed, { color: 'success' }], [` ${s.content}`, DIM]]
    : [[MARK.in_progress, { color: 'claude' }], [` ${s.content}`, { weight: 'semibold' }]]
}

const agentsRow = (list: readonly ActivityAgent[], now: number, cols: number): Span[] => {
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

// A band that fails to record must not fail the tool call or spawn it watches.
const quiet = () => {}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // An agent can stop with no event this plugin hears, and the elapsed minutes are read while drawing.
    $.clock.every(30_000, async () => {
      const list = active(await $.agent.list())
      await update($, agents, () => list)
    })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__ccd_turn__update_plan' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined && r.deny === undefined && r.isError !== true) {
      await update($, plan, prev => applyPlan(prev, e)).catch(quiet)
    }
    return r
  })

  // The app checks the whole list off when the turn wraps up.
  on('tool.call', { tool: 'mcp__ccd_turn__wrap_up' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined && r.deny === undefined && r.isError !== true) {
      await update($, plan, finishPlan).catch(quiet)
    }
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    await $.agent
      .list()
      .then(list => update($, agents, () => active(list)))
      .catch(quiet)
    return r
  })

  // A subagent's own turn.complete already finds it listed as completed.
  on('turn.complete', async ($, e, next) => {
    const list = active(await $.agent.list())
    await update($, agents, () => list)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const steps = await read($, plan)
    const working = waitingFirst(await read($, agents))
    const hasPlan = steps.some(s => s.status !== 'completed')
    if (!hasPlan && working.length === 0) return below

    const now = await $.clock.now()
    // A turn that stopped short of its wrap-up leaves steps undone: the row stays, drawn as paused.
    const { isWorking, bodyColumns } = e.props
    const { Box, Text } = $.ui.resolve(e)

    // One Text a row, cut at the edge: sibling Texts wrap into columns once the line overflows.
    const line = (spans: Span[], props: TextProps & { key?: string }) => (
      <Text {...props}>
        {spans.map(([text, style = {}], i) => (
          <Text key={`${i}`} {...style}>
            {text}
          </Text>
        ))}
      </Text>
    )
    const planLine = hasPlan && line(planRow(steps, isWorking, bodyColumns), { wrap: 'truncate-end' })
    const agentsLine = working.length > 0 && line(agentsRow(working, now, bodyColumns), { wrap: 'truncate-end' })

    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          {below}
          {planLine}
          {agentsLine}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {below}
        {hasPlan && (
          <Box key="plan" flexDirection="row" alignItems="center">
            {planLine}
            {/* The desktop pops an absolute hover reveal above its keyed Box as a bordered card, whatever the offsets. */}
            <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
              {steps.map((s, i) => line(stepLine(s, isWorking), { key: `${i}` }))}
            </Box>
          </Box>
        )}
        {working.length > 0 && (
          <Box key="agents" flexDirection="row" alignItems="center">
            {agentsLine}
            <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
              {working.flatMap(a => {
                const summary = a.label.trim().replace(/\n[\s\S]*/, '')
                const head = line(
                  [[a.status, statusStyle(a)], [`${SEP}${a.type}: ${a.description} ${elapsed(now, a.startTime)}`]],
                  { key: a.id },
                )
                if (summary === '' || summary === a.description) return [head]
                return [
                  head,
                  <Text key={`${a.id}:label`} dimColor>
                    {clip(summary, CARD_COLS)}
                  </Text>,
                ]
              })}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
