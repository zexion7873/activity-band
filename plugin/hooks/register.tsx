import { atom, read, update } from 'claude-code'
import type { AgentInfo, Hook, Register, TextProps } from 'claude-code'

import type { ActivityAgent, PlanStep } from '../types'
import { applyPlan, finishPlan } from './plan'
import { agentHead, agentsRow, clip, planRow, stepLine } from './rows'
import type { Span } from './rows'

const plan = atom({ plugin: 'activity-band', key: 'plan' } as const, [] as PlanStep[])
// Change the tag with ActivityAgent: a reload then reads the stored list as empty, not as agents missing a field.
const agents = atom({ plugin: 'activity-band', key: 'agents' } as const, [] as ActivityAgent[], { shape: 'agents-3' })
// True from a main turn's start until that turn writes the plan: steps an earlier turn left are not this turn's work.
const stale = atom({ plugin: 'activity-band', key: 'stale' } as const, false)

const CARD_COLS = 100
// The engine lists a finished agent until it drops its task; only these are still at work.
const ACTIVE: readonly string[] = ['pending', 'running', 'waiting', 'idle']

const ENDED: readonly string[] = ['failed', 'killed']
// How long one that failed or was stopped stays on the row.
const ENDED_SHOWN = 5 * 60_000

const track = (prev: readonly ActivityAgent[], list: readonly AgentInfo[], now: number): ActivityAgent[] =>
  list.flatMap(({ id, type, description, label, status, startTime, tokenCount, tokenSamples, lastRequest }): ActivityAgent[] => {
    const a = { id, type, description, label, status, startTime }
    // A long answer still streaming moves the count, so a count that stands still is what makes an old request quiet.
    const isStill = status === 'running' && lastRequest !== undefined && tokenSamples.every(n => n === tokenCount)
    if (ACTIVE.includes(status)) return [isStill ? { ...a, quietSince: lastRequest.at } : a]
    // The engine goes on listing one that failed; only one this mod saw at work ended on its watch.
    const was = prev.find(p => p.id === id)
    if (!ENDED.includes(status) || was === undefined) return []
    const endedAt = was.endedAt ?? now
    return now - endedAt < ENDED_SHOWN ? [{ ...a, endedAt }] : []
  })

// A band that fails to record must not fail the tool call or spawn it watches.
const quiet = () => {}

const refresh = ($: Parameters<Hook<'agent.spawn'>>[0]) =>
  Promise.all([$.agent.list(), $.clock.now()])
    .then(([list, now]) => update($, agents, prev => track(prev, list, now)))
    .catch(quiet)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // An agent can stop with no event this plugin hears, and the elapsed minutes are read while drawing.
    $.clock.every(30_000, () => refresh($))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) await update($, stale, () => true).catch(quiet)
    return r
  })

  on('tool.call', { tool: 'mcp__ccd_turn__update_plan' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined && r.deny === undefined && r.isError !== true) {
      await update($, plan, prev => applyPlan(prev, e))
        .then(() => update($, stale, () => false))
        .catch(quiet)
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
    await refresh($)
    return r
  })

  // A subagent's own turn.complete already finds it listed as completed.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const steps = await read($, plan)
    const working = await read($, agents)
    const hasPlan = steps.some(s => s.status !== 'completed')
    if (!hasPlan && working.length === 0) return below

    const now = await $.clock.now()
    // A turn that stopped short of its wrap-up leaves steps undone: the row stays, drawn as paused until a turn takes them up.
    const { bodyColumns } = e.props
    const isLive = e.props.isWorking && !(await read($, stale))
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
    const planLine = hasPlan && line(planRow(steps, isLive, bodyColumns), { wrap: 'truncate-end' })
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
              {steps.map((s, i) => line(stepLine(s, isLive), { key: `${i}` }))}
            </Box>
          </Box>
        )}
        {working.length > 0 && (
          <Box key="agents" flexDirection="row" alignItems="center">
            {agentsLine}
            <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
              {working.flatMap(a => {
                const summary = a.label.trim().replace(/\n[\s\S]*/, '')
                const head = line(agentHead(a, now), { key: a.id })
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
