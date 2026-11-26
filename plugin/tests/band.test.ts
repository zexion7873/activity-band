import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { applyPlan } from '../hooks/plan'
import { agentHead, agentsRow, cells, elapsed, planRow } from '../hooks/rows'
import type { Span } from '../hooks/rows'
import type { ActivityAgent, PlanStep } from '../types'

const NOW = Date.parse('2026-11-25T12:00:00Z')

const BAND = {
  plugin: 'activity-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 3,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const

const PLAN: PlanStep[] = [
  { content: 'read the code', status: 'completed' },
  { content: 'write the fix', status: 'in_progress' },
  { content: 'run the tests', status: 'pending' },
]

const UPDATE_PLAN = 'mcp__ccd_turn__update_plan'
const WRAP_UP = 'mcp__ccd_turn__wrap_up'

// An app tool is in no tool table the types know, and with a session's MCP tools laid beside them
// the typed call's union is too deep for tsc to instantiate (TS2589).
function call($: Engine, tool: string, input: Record<string, unknown>) {
  return ($.tool.call as unknown as (input: Record<string, unknown>) => Promise<unknown>)({ tool, ...input })
}

const SPAWN = {
  tool_use_id: 't1',
  prompt: 'Map the hooks.',
  description: 'map the hooks',
  subagentType: 'Explore',
  provider: { plugin: 'core', tier: 'core' },
  parentModel: 'm',
  background: true,
  fork: false,
} as const

const agent = (id: string, description: string, status: string, minutesAgo: number, label = description) =>
  ({
    id,
    type: 'Explore',
    description,
    status,
    label,
    startTime: NOW - minutesAgo * 60_000,
    tokenCount: 0,
    tokenSamples: [0],
  }) as unknown as AgentInfo

const engine = (on: On) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
}

const text = (row: readonly Span[]) => row.map(([t]) => t).join('')

const working = (type: string, description: string, status: string, minutesAgo: number): ActivityAgent => ({
  id: `${type}:${description}`,
  type,
  description,
  label: description,
  status,
  startTime: NOW - minutesAgo * 60_000,
})

const LONG_PLAN: PlanStep[] = Array.from({ length: 30 }, (_, i) => ({
  content: `step number ${i + 1} with a longer description`,
  status: i < 12 ? 'completed' : i === 12 ? 'in_progress' : 'pending',
}))

const TWO_AGENTS = [
  working('general-purpose', 'review the diff', 'waiting', 5),
  working('Explore', 'map the hooks', 'running', 3),
]
const LONG_TYPE = [working('some-plugin:very-long-agent-type-name', 'do the thing', 'running', 1)]

test('plan row shows its marks and the step in progress, and follows an advance', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, { items: PLAN })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
    expect(texts).toContain('plan ▮▯▯ ▶ write the fix → run the tests')
    await ui.unmount()
  }

  await call($, UPDATE_PLAN, { advance: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(texts).toContain('plan ▮▮▯ ▶ run the tests')
  await ui.unmount()
})

test('desktop card lists every step with its mark', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, { items: PLAN })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^▮ read the code$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▶ write the fix$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▯ run the tests$/ })).toBeDefined()
  await ui.unmount()
})

test('plan row leaves when the turn wraps up', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, { items: PLAN })
  await call($, WRAP_UP, { recap: 'done' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('a refused plan call changes nothing', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('tool.call', () => ({ deny: 'no' }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  await call($, UPDATE_PLAN, { items: PLAN })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('band draws nothing with no plan and no agent at work', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text' })).toBeUndefined()
    await ui.unmount()
  }
})

test('band keeps what the plugins beneath it drew', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return Box({ children: Text({ children: 'beneath' }) })
  })
  await call($, UPDATE_PLAN, { items: PLAN })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /plan ▮▯▯ ▶/ })).toBeDefined()
    await ui.unmount()
  }
})

test('agents row counts the agents at work and leaves out a finished one', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({
    value: [agent('a1', 'map the hooks', 'running', 3), agent('a0', 'old job', 'completed', 10)],
  }))
  await $.agent.spawn(SPAWN)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
    expect(texts).toContain('agents 1')
    expect(texts).toContain('Explore: map the hooks 3m')
    expect(texts).not.toContain('old job')
    await ui.unmount()
  }
})

test('agents row leaves within a tick when an agent stops with no event', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  let listed = [agent('a1', 'map the hooks', 'running', 0)]
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({ value: listed }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(SPAWN)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /agents 1/ })).toBeDefined()

  listed = [agent('a1', 'map the hooks', 'completed', 0)]
  await clock.advance(30_000)
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('agents row keeps an agent that failed or was stopped for five minutes, under its outcome', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  const old = agent('a0', 'old job', 'failed', 10)
  let listed = [agent('a1', 'map the hooks', 'running', 3), agent('a2', 'read the tests', 'running', 2), old]
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({ value: listed }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(SPAWN)

  const texts = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const found = await ui.findAll({ type: 'Text' })
    await ui.unmount()
    return found
  }
  const row = async () => (await texts()).find(t => t.props.wrap !== undefined)?.text
  // One that had failed before the mod saw it at work is not news.
  expect(await row()).toBe('agents 2 Explore: map the hooks 3m · Explore: read the tests 2m')

  listed = [agent('a1', 'map the hooks', 'failed', 3), agent('a2', 'read the tests', 'killed', 2), old]
  await clock.advance(30_000)
  const ENDED = 'agents 2 Explore: map the hooks failed 3m · Explore: read the tests stopped 2m'
  expect(await row()).toBe(ENDED)
  const style = async (text: string) => {
    const props = (await texts()).find(t => t.text === text)?.props
    return [props?.color, props?.dimColor]
  }
  expect(await style(' failed 3m')).toEqual(['error', undefined])
  expect(await style(' stopped 2m')).toEqual([undefined, true])

  // Four and a half minutes after they were seen ended: still there, and the minutes are how long each ran.
  await clock.advance(270_000)
  expect(await row()).toBe(ENDED)
  await clock.advance(30_000)
  expect(await row()).toBeUndefined()
})

test("a subagent's plan call is not the session's plan", async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, { items: PLAN, agentId: 'a1' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('terminal draws each row as one line cut at the edge', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({ value: [agent('a1', 'map the hooks', 'running', 3)] }))
  await call($, UPDATE_PLAN, { items: PLAN })
  await $.agent.spawn(SPAWN)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const lines = (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap !== undefined)
  expect(lines.map(t => [t.props.wrap, t.text])).toEqual([
    ['truncate-end', 'plan ▮▯▯ ▶ write the fix → run the tests'],
    ['truncate-end', 'agents 1 Explore: map the hooks 3m'],
  ])
  await ui.unmount()
})

test('plan row goes dim and shows a pause mark when no turn is running', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, { items: PLAN })

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: false }, surface: 'terminal' })
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.filter(t => t.props.wrap !== undefined).map(t => t.text)).toEqual(['plan ▮▯▯ ‖ write the fix'])
  const spans = texts.filter(t => t.props.wrap === undefined)
  expect(spans.every(t => t.props.dimColor === true && t.props.color === undefined)).toBe(true)
  await ui.unmount()

  const card = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: false }, surface: 'desktop' })
  expect(await card.find({ type: 'Text', text: /^‖ write the fix$/ })).toBeDefined()
  await card.unmount()
})

test('plan row colors a finished step and the step in progress', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, { items: PLAN })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^▮$/ }))?.props.color).toBe('success')
    expect((await ui.find({ type: 'Text', text: /^ ▶ $/ }))?.props.color).toBe('claude')
    await ui.unmount()
  }
})

test('plan row cuts a wide-character step by cells and drops the next step when narrow', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, {
    items: [
      { content: '讀程式碼', status: 'completed' },
      { content: '把殭屍列修好並補上測試', status: 'in_progress' },
      { content: '跑測試', status: 'pending' },
    ],
  })

  const row = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
    const text = (await ui.findAll({ type: 'Text' })).find(t => t.props.wrap !== undefined)?.text
    await ui.unmount()
    return text
  }
  // 11 cells of head, 19 left: nine two-cell characters and the ellipsis.
  expect(await row(30)).toBe('plan ▮▯▯ ▶ 把殭屍列修好並補上…')
  expect(await row(100)).toBe('plan ▮▯▯ ▶ 把殭屍列修好並補上測試 → 跑測試')
})

test('agents row names a waiting agent dim, in the order listed', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({
    value: [agent('a1', 'map the hooks', 'running', 3), agent('a2', 'review the diff', 'waiting', 5)],
  }))
  await $.agent.spawn(SPAWN)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = await ui.findAll({ type: 'Text' })
    expect(texts.map(t => t.text)).toContain(
      'agents 2 Explore: map the hooks 3m · Explore: review the diff waiting 5m',
    )
    const status = texts.find(t => t.text === ' waiting 5m')?.props
    expect([status?.dimColor, status?.color]).toEqual([true, undefined])
    await ui.unmount()
  }
})

test('agents row shows as many agents as the width holds', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({
    value: [
      agent('a1', 'map the hooks', 'running', 3),
      agent('a2', 'read the tests', 'running', 1),
      agent('a3', 'check the docs', 'running', 2),
    ],
  }))
  await $.agent.spawn(SPAWN)

  const row = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'terminal' })
    const text = (await ui.findAll({ type: 'Text' })).find(t => t.props.wrap !== undefined)?.text
    await ui.unmount()
    return text
  }
  expect(await row(40)).toBe('agents 3 Explore: map the hooks 3m +2')
  expect(await row(100)).toBe(
    'agents 3 Explore: map the hooks 3m · Explore: read the tests 1m · Explore: check the docs 2m',
  )
})

test('desktop agents card names a failed agent in the error color', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  let listed = [agent('a1', 'map the hooks', 'running', 3)]
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({ value: listed }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn(SPAWN)
  listed = [agent('a1', 'map the hooks', 'failed', 3)]
  await clock.advance(30_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^failed · Explore: map the hooks 3m$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^failed$/ }))?.props.color).toBe('error')
  await ui.unmount()
})

test("desktop agents card adds an agent's progress line when it has one", async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({
    value: [
      agent('a1', 'map the hooks', 'running', 3, 'Reading register.tsx\nthen the tests'),
      agent('a2', 'review the diff', 'running', 5),
    ],
  }))
  await $.agent.spawn(SPAWN)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^running · Explore: map the hooks 3m$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Reading register\.tsx$/ })).toBeDefined()
  // A progress line is dim; the description on the row and in the card's head line is not.
  const repeated = (await ui.findAll({ type: 'Text' })).filter(t => t.text === 'review the diff' && t.props.dimColor === true)
  expect(repeated).toEqual([])
  await ui.unmount()
})

test('desktop agents card draws only the description at full strength', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({ value: [agent('a1', 'map the hooks', 'running', 3)] }))
  await $.agent.spawn(SPAWN)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.find(t => t.text === 'running')?.props.dimColor).toBe(true)
  expect(texts.find(t => t.text === ' · Explore: ')?.props.dimColor).toBe(true)
  // One on the row and one in the card.
  expect(texts.filter(t => t.text === 'map the hooks' && t.props.dimColor === undefined).length).toBe(2)
  expect(texts.filter(t => t.text === ' 3m' && t.props.dimColor === true).length).toBe(2)
  await ui.unmount()
})

test('done and start mark steps by their 1-based number', () => {
  expect(applyPlan(PLAN, { done: [2], start: 3 }).map(s => s.status)).toEqual(['completed', 'completed', 'in_progress'])
})

test('a malformed step list leaves the plan as it was', () => {
  expect(applyPlan(PLAN, { items: [{ content: 'no status' }] })).toEqual(PLAN)
})

test('plan row stays paused through a later turn that leaves the plan alone', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  const row = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const line = (await ui.findAll({ type: 'Text' })).find(t => t.props.wrap !== undefined)?.text
    await ui.unmount()
    return line
  }

  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  await call($, UPDATE_PLAN, { items: PLAN })
  expect(await row()).toBe('plan ▮▯▯ ▶ write the fix → run the tests')

  await $.turn.start({ text: 'something else', turnId: 't2' })
  expect(await row()).toBe('plan ▮▯▯ ‖ write the fix')

  await $.turn.start({ text: 'map the hooks', turnId: 't3', agentId: 'a1' })
  await call($, UPDATE_PLAN, { advance: true })
  expect(await row()).toBe('plan ▮▮▯ ▶ run the tests')

  await $.turn.start({ text: 'read the tests', turnId: 't4', agentId: 'a1' })
  expect(await row()).toBe('plan ▮▮▯ ▶ run the tests')
})

test('plan row gives its marks up for a count before the step in progress loses its room', () => {
  expect(text(planRow(LONG_PLAN, true, 100))).toBe(
    'plan 12/30 done ▶ step number 13 with a longer description → step number 14 with a longer descripti…',
  )
  expect(text(planRow(LONG_PLAN, true, 40))).toBe('plan 12/30 done ▶ step number 13 with a…')
})

test('plan row gives every step in progress the accent mark', () => {
  const steps: PlanStep[] = [
    { content: 'a', status: 'in_progress' },
    { content: 'b', status: 'in_progress' },
    { content: 'c', status: 'pending' },
  ]
  const marks = planRow(steps, true, 100).filter(([t]) => t === '▯')
  expect(marks.map(([, style]) => style?.color)).toEqual(['claude', 'claude', undefined])
})

test('plan row shows the pause mark with no step in progress and no turn running', () => {
  const steps: PlanStep[] = [
    { content: 'a', status: 'completed' },
    { content: 'b', status: 'completed' },
    { content: 'c', status: 'pending' },
    { content: 'd', status: 'pending' },
  ]
  expect(text(planRow(steps, false, 100))).toBe('plan ▮▮▯▯ ‖')
  expect(text(planRow(steps, true, 100))).toBe('plan ▮▮▯▯')
})

test('agents row shows every agent whose description has room, and hands spare cells to a longer one', () => {
  const three = ['map hooks', 'map tests', 'map tools'].map(d => working('Explore', d, 'running', 1))
  expect(text(agentsRow(three, NOW, 80))).toBe(
    'agents 3 Explore: map hooks 1m · Explore: map tests 1m · Explore: map tools 1m',
  )
  const uneven = ['lint', 'rewrite the allocation loop'].map(d => working('Explore', d, 'running', 1))
  expect(text(agentsRow(uneven, NOW, 60))).toBe('agents 2 Explore: lint 1m · Explore: rewrite the allocat… 1m')
})

test('agents row draws the type and the separator dim, and the description at full strength', () => {
  expect(agentsRow(TWO_AGENTS, NOW, 100).map(([t, style]) => [t, style?.dimColor === true])).toEqual([
    ['agents 2 ', true],
    ['general-purpose: ', true],
    ['review the diff', false],
    [' waiting 5m', true],
    [' · Explore: ', true],
    ['map the hooks', false],
    [' 3m', true],
  ])
  // A type left out leaves no span of its own behind.
  expect(agentsRow(TWO_AGENTS, NOW, 40).map(([t, style]) => [t, style?.dimColor === true])).toEqual([
    ['agents 2 ', true],
    ['review the diff', false],
    [' waiting 5m', true],
    [' +1', true],
  ])
})

test('agents row gives up the type before the description', () => {
  expect(text(agentsRow(TWO_AGENTS, NOW, 60))).toBe('agents 2 general-purpose: review the diff waiting 5m +1')
  expect(text(agentsRow(TWO_AGENTS, NOW, 45))).toBe('agents 2 general…: review the… waiting 5m +1')
  expect(text(agentsRow(TWO_AGENTS, NOW, 40))).toBe('agents 2 review the diff waiting 5m +1')
  expect(text(agentsRow(LONG_TYPE, NOW, 40))).toBe('agents 1 some-plugin:v…: do the thing 1m')
})

test('agents row says quiet once a running agent has sent no request for two minutes', () => {
  const quietFor = (minutes: number): ActivityAgent => ({
    ...working('Explore', 'map the hooks', 'running', 12),
    quietSince: NOW - minutes * 60_000,
  })
  expect(text(agentsRow([quietFor(1.5)], NOW, 100))).toBe('agents 1 Explore: map the hooks 12m')
  expect(text(agentsRow([quietFor(2)], NOW, 100))).toBe('agents 1 Explore: map the hooks quiet 2m')
  expect(text(agentHead(quietFor(1.5), NOW))).toBe('running · Explore: map the hooks 12m')
  expect(text(agentHead(quietFor(4), NOW))).toBe('running · Explore: map the hooks 12m · quiet 4m')
})

test('only a running agent whose token count stands still is quiet since its last request', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  const sent = { lastRequest: { at: NOW - 3 * 60_000, model: 'm' } }
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('agent.list', () => ({
    value: [
      { ...agent('a1', 'map the hooks', 'running', 12), ...sent, tokenCount: 500, tokenSamples: [500, 500, 500] },
      { ...agent('a2', 'read the tests', 'running', 5), ...sent, tokenCount: 500, tokenSamples: [400, 450, 500] },
      { ...agent('a3', 'check the docs', 'running', 1), tokenCount: 0, tokenSamples: [0, 0] },
      { ...agent('a4', 'review the diff', 'waiting', 5), ...sent, tokenCount: 500, tokenSamples: [500, 500] },
    ] as AgentInfo[],
  }))
  await $.agent.spawn(SPAWN)

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 200 }, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text' })).find(t => t.props.wrap !== undefined)?.text).toBe(
    'agents 4 Explore: map the hooks quiet 3m · Explore: read the tests 5m · Explore: check the docs 1m · Explore: review the diff waiting 5m',
  )
  await ui.unmount()
})

test('a run of an hour or more is written in hours', () => {
  const ago = (minutes: number) => elapsed(NOW, NOW - minutes * 60_000)
  expect([0.5, 59, 60, 61, 180, 200, 1500].map(ago)).toEqual(['<1m', '59m', '1h', '1h1m', '3h', '3h20m', '25h'])
  expect(text(agentsRow([working('Explore', 'map the hooks', 'running', 200)], NOW, 100))).toBe(
    'agents 1 Explore: map the hooks 3h20m',
  )
})

test('no row is wider than the width it was given', () => {
  const widths = Array.from({ length: 120 }, (_, i) => i + 1)
  const over = (row: (cols: number) => Span[]) => widths.filter(cols => cells(text(row(cols))) > cols)
  expect(over(cols => planRow(LONG_PLAN, true, cols))).toEqual([])
  expect(over(cols => planRow(PLAN, false, cols))).toEqual([])
  expect(over(cols => agentsRow(TWO_AGENTS, NOW, cols))).toEqual([])
  expect(over(cols => agentsRow(LONG_TYPE, NOW, cols))).toEqual([])
})
