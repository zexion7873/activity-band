import { atom, read, update } from 'claude-code'
import type { AgentInfo, Register } from 'claude-code'

import type { ActivityAgent, PlanStep } from '../types'
import { applyPlan, finishPlan } from './plan'

const plan = atom({ plugin: 'activity-band', key: 'plan' } as const, [] as PlanStep[])
const agents = atom({ plugin: 'activity-band', key: 'agents' } as const, [] as ActivityAgent[])

const MAX_LABEL = 60
const MAX_ON_ROW = 2
// The engine lists a finished agent until it drops its task; only these are still at work.
const ACTIVE: readonly string[] = ['pending', 'running', 'waiting', 'idle']
const MARK = { completed: '☑', in_progress: '▶', pending: '☐' } as const

const clip = (s: string) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s)

const active = (list: readonly AgentInfo[]): ActivityAgent[] =>
  list
    .filter(a => ACTIVE.includes(a.status))
    .map(({ id, type, description, status, startTime }) => ({ id, type, description, status, startTime }))

const elapsed = (now: number, startTime: number) => {
  const minutes = Math.floor((now - startTime) / 60_000)
  return minutes < 1 ? '<1m' : `${minutes}m`
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
    const running = await read($, agents)
    const done = steps.filter(s => s.status === 'completed').length
    const hasPlan = steps.length > 0 && done < steps.length
    if (!hasPlan && running.length === 0) return below

    const now = await $.clock.now()
    const current = steps.find(s => s.status === 'in_progress')
    const count = `${done}/${steps.length}`
    const label = current === undefined ? '' : `▶ ${clip(current.content)}`
    const lines = running.map(a => `${a.type}: ${clip(a.description)} ${elapsed(now, a.startTime)}`)
    const more = running.length > MAX_ON_ROW ? ` +${running.length - MAX_ON_ROW}` : ''
    const onRow = `${lines.slice(0, MAX_ON_ROW).join(' · ')}${more}`

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {below}
          {/* One Text a row, cut at the edge: sibling Texts wrap into columns once the line overflows. */}
          {hasPlan && (
            <Text wrap="truncate-end">
              <Text dimColor>plan {count}</Text>
              {label && <Text> {label}</Text>}
            </Text>
          )}
          {running.length > 0 && (
            <Text wrap="truncate-end">
              <Text dimColor>agents {running.length}</Text>
              <Text> {onRow}</Text>
            </Text>
          )}
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        {hasPlan && (
          <Box key="plan" flexDirection="row" alignItems="center" gap={1}>
            <Text dimColor tabular>plan {count}</Text>
            {label && <Text>{label}</Text>}
            {/* The desktop pops an absolute hover reveal above its keyed Box as a bordered card, whatever the offsets. */}
            <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
              {steps.map((s, i) => (
                <Text key={`${i}`} dimColor={s.status !== 'in_progress'}>{`${MARK[s.status]} ${s.content}`}</Text>
              ))}
            </Box>
          </Box>
        )}
        {running.length > 0 && (
          <Box key="agents" flexDirection="row" alignItems="center" gap={1}>
            <Text dimColor tabular>agents {running.length}</Text>
            <Text>{onRow}</Text>
            <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
              {running.map((a, i) => (
                <Text key={a.id} dimColor={a.status !== 'running'}>{`${a.status} · ${lines[i]}`}</Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
