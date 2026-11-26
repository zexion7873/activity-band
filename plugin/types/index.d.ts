export type PlanStatus = 'pending' | 'in_progress' | 'completed'

export type PlanStep = { content: string; status: PlanStatus }

export type ActivityAgent = {
  id: string
  type: string
  description: string
  label: string
  status: string
  startTime: number
  // When the mod first found it failed or killed; set only on one it had seen at work.
  endedAt?: number
  // When a running agent's loop last sent a request, kept only while its token count stands still.
  quietSince?: number
  parentId?: string
  model?: string
  // The share of its model's context window its token count takes, in whole percent.
  contextPercent?: number
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'activity-band': { plan: PlanStep[]; agents: Shaped<ActivityAgent[]>; stale: boolean }
  }
}
