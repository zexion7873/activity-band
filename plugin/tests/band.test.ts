import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { applyPlan } from '../hooks/plan'
import type { PlanStep } from '../types'

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
  ({ id, type: 'Explore', description, status, label, startTime: NOW - minutesAgo * 60_000 }) as unknown as AgentInfo

const engine = (on: On) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
}

test('plan row shows the count and the step in progress, and follows an advance', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, { items: PLAN })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
    expect(texts).toContain('plan ▰▱▱ 1/3 ▶ write the fix → run the tests')
    await ui.unmount()
  }

  await call($, UPDATE_PLAN, { advance: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(texts).toContain('plan ▰▰▱ 2/3 ▶ run the tests')
  await ui.unmount()
})

test('desktop card lists every step with its mark', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await call($, UPDATE_PLAN, { items: PLAN })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^☑ read the code$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▶ write the fix$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^☐ run the tests$/ })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /plan ▰▱▱ 1\/3/ })).toBeDefined()
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

  listed = [agent('a1', 'map the hooks', 'killed', 0)]
  await clock.advance(30_000)
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
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
    ['truncate-end', 'plan ▰▱▱ 1/3 ▶ write the fix → run the tests'],
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
  expect(texts.filter(t => t.props.wrap !== undefined).map(t => t.text)).toEqual(['plan ▰▱▱ 1/3 ‖ write the fix'])
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
    expect((await ui.find({ type: 'Text', text: /^▰$/ }))?.props.color).toBe('success')
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
  // 15 cells of head, 15 left: seven two-cell characters and the ellipsis.
  expect(await row(30)).toBe('plan ▰▱▱ 1/3 ▶ 把殭屍列修好並…')
  expect(await row(100)).toBe('plan ▰▱▱ 1/3 ▶ 把殭屍列修好並補上測試 → 跑測試')
})

test('agents row puts a waiting agent first, named and colored', async ($, on) => {
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
      'agents 2 Explore: review the diff waiting 5m · Explore: map the hooks 3m',
    )
    expect(texts.find(t => t.text === ' waiting 5m')?.props.color).toBe('warning')
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
  expect(await ui.find({ type: 'Text', text: /^review the diff$/ })).toBeUndefined()
  await ui.unmount()
})

test('done and start mark steps by their 1-based number', () => {
  expect(applyPlan(PLAN, { done: [2], start: 3 }).map(s => s.status)).toEqual(['completed', 'completed', 'in_progress'])
})

test('a malformed step list leaves the plan as it was', () => {
  expect(applyPlan(PLAN, { items: [{ content: 'no status' }] })).toEqual(PLAN)
})
