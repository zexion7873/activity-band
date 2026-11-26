import type { PlanStatus, PlanStep } from '../types'

const STATUSES: readonly string[] = ['pending', 'in_progress', 'completed']

const isStep = (item: unknown): item is PlanStep =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as PlanStep).content === 'string' &&
  STATUSES.includes((item as PlanStep).status)

// A step carries the time it became in progress only while it is; one already in progress keeps the time it has.
const step = (content: string, status: PlanStatus, was: PlanStep | undefined, now: number): PlanStep =>
  status === 'in_progress' ? { content, status, startedAt: was?.startedAt ?? now } : { content, status }

const set = (plan: PlanStep[], index: number, status: PlanStatus, now: number) =>
  plan.map((s, i) => (i === index ? step(s.content, status, s, now) : s))

// The input is the model's JSON for the desktop app's update_plan tool; steps are numbered from 1.
export const applyPlan = (prev: PlanStep[], input: Record<string, unknown>, now: number): PlanStep[] => {
  if (Array.isArray(input.items)) {
    if (!input.items.every(isStep)) return prev
    // The app sends the whole list again on any change, so a step is the one it was by its text.
    return input.items.map(({ content, status }) =>
      step(content, status, prev.find(p => p.content === content && p.status === 'in_progress'), now),
    )
  }

  let plan = prev
  if (Array.isArray(input.done)) {
    for (const n of input.done) if (typeof n === 'number') plan = set(plan, n - 1, 'completed', now)
  }
  if (typeof input.start === 'number') plan = set(plan, input.start - 1, 'in_progress', now)
  if (input.advance === true) {
    plan = set(plan, plan.findIndex(s => s.status === 'in_progress'), 'completed', now)
    plan = set(plan, plan.findIndex(s => s.status === 'pending'), 'in_progress', now)
  }
  return plan
}

export const finishPlan = (prev: PlanStep[]): PlanStep[] => prev.map(({ content }) => ({ content, status: 'completed' }))
