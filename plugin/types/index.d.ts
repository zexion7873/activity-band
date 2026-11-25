export type PlanStatus = 'pending' | 'in_progress' | 'completed'

export type PlanStep = { content: string; status: PlanStatus }

export type ActivityAgent = {
  id: string
  type: string
  description: string
  label: string
  status: string
  startTime: number
}

declare module 'claude-code' {
  interface PluginState {
    'activity-band': { plan: PlanStep[]; agents: Shaped<ActivityAgent[]> }
  }
}
