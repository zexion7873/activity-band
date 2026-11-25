import type { PlanStatus, PlanStep } from '../types'

const STATUSES: readonly string[] = ['pending', 'in_progress', 'completed']

const isStep = (item: unknown): item is PlanStep =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as PlanStep).content === 'string' &&
  STATUSES.includes((item as PlanStep).status)

const set = (plan: PlanStep[], index: number, status: PlanStatus) =>
  plan.map((step, i) => (i === index ? { ...step, status } : step))

// The input is the model's JSON for the desktop app's update_plan tool; steps are numbered from 1.
export const applyPlan = (prev: PlanStep[], input: Record<string, unknown>): PlanStep[] => {
  if (Array.isArray(input.items)) {
    return input.items.every(isStep) ? input.items.map(({ content, status }) => ({ content, status })) : prev
  }

  let plan = prev
  if (Array.isArray(input.done)) {
    for (const n of input.done) if (typeof n === 'number') plan = set(plan, n - 1, 'completed')
  }
  if (typeof input.start === 'number') plan = set(plan, input.start - 1, 'in_progress')
  if (input.advance === true) {
    plan = set(plan, plan.findIndex(step => step.status === 'in_progress'), 'completed')
    plan = set(plan, plan.findIndex(step => step.status === 'pending'), 'in_progress')
  }
  return plan
}

export const finishPlan = (prev: PlanStep[]): PlanStep[] => prev.map(step => ({ ...step, status: 'completed' }))
