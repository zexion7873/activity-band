<div align="center">

# 🧭 activity-band

[![CI: check](https://github.com/zexion7873/activity-band/actions/workflows/check.yml/badge.svg)](https://github.com/zexion7873/activity-band/actions/workflows/check.yml)

<img src="docs/band.svg" width="672" title="Drawn by the mod's own row builders from sample steps and agents, not a screenshot." alt="The band's two rows, drawn by the mod's own row builders from sample steps and agents rather than a screenshot. The plan row: five marks, two filled green for finished steps, one hollow in the accent color for the step in progress and two hollow grey for pending ones, then 2/5, a play mark and 'write the fix' in bold, then an arrow and the next step, 'run the tests', dimmed. The agents row: 'agents 2', then 'general-purpose: review the diff' with 'waiting 5m' in the warning color, then 'Explore: map the hooks' with '3m'.">

**Shows the plan step in progress and the subagents still running, above the
Claude Code prompt, so you need not open a panel to see where a turn is.**

[![License: MIT](https://img.shields.io/github/license/zexion7873/activity-band?style=flat)](LICENSE)
[![Surface: desktop](https://img.shields.io/badge/surface-desktop-lightgrey?style=flat)](#limits)
[![Network: none](https://img.shields.io/badge/network-none-brightgreen?style=flat)](#what-it-reads-and-writes)

No model calls. No network requests. No files written. No rewriting what the
model reads.

</div>

---

The desktop app keeps a turn's task list under Claude's latest message and its
subagents in a side panel. Scroll up, or close the panel, and both are out of
sight. activity-band puts the two facts you look for on rows above the prompt:

```
plan ▰▰▱▱▱ 2/5 ▶ write the fix → run the tests
agents 2 general-purpose: review the diff waiting 5m · Explore: map the hooks 3m
```

- **The plan row:** one mark for each step (`▰` done, `▱` not yet), how many
  are done out of how many, the step in progress, and the next step when the
  row has room for it. It is drawn while a plan has a step left, and leaves
  when the turn wraps up. A turn that stops before its wrap-up leaves the row
  dimmed, with `‖` in place of `▶`, until the next plan.
- **The agents row:** how many subagents are still at work, then as many of
  them as the row has room for, as `type: description` with the minutes since
  each started, then `+N` for the rest. One that is not running shows its
  status before the minutes, and a `waiting` one comes first, in the warning
  color. It leaves when the last one finishes.
- **A card on hover** (desktop app): every step with its mark (`☑` done, `▶` in
  progress, `☐` pending) over the plan row; every working agent with its status
  over the agents row, and under it the first line of its latest progress
  summary when it has one.

With no plan and no agent at work the mod draws nothing.

## Install

Needs a Claude Code build with function-hook plugins; tested against 2.1.330.

At the prompt of a terminal session:

```
/plugin install activity-band --marketplace zexion7873/activity-band
```

From a shell:

```bash
claude plugin install activity-band --marketplace zexion7873/activity-band
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `zexion7873/activity-band`, then Add
plugin.

## What it reads and writes

| Hook | Reads | Changes |
| --- | --- | --- |
| `session.start` | nothing | starts a 30 second timer that re-reads the agent list |
| `tool.call` (the desktop app's `update_plan`) | the call's arguments, after it ran: each step's text and status | the plan kept in the session's state; the call and its result pass through untouched |
| `tool.call` (the desktop app's `wrap_up`) | only whether the call succeeded | marks every step done, which empties the plan row |
| `agent.spawn`, `turn.complete`, the timer | the session's agent list: each agent's id, type, description, latest progress summary, status and start time | the list of working agents kept in the session's state |
| `ui.render` (`AbovePrompt`) | that state, the clock, the band's width and whether a turn is running | draws the rows, with whatever another mod drew on this mod's row kept above them |

Both values live in the session's state, in memory. Nothing is written to disk
or to the per-plugin store, and nothing outlives the session.

## Limits

- **The plan row is the desktop app's.** It follows the task-list tool the
  desktop app gives Claude. A terminal session has no such tool, so it shows
  the agents row alone. That tool's name and arguments are the app's own, not a
  documented interface: if the app changes them the plan row goes quiet, and
  nothing else breaks.
- **The plan row lasts one turn.** The app checks the whole list off when a
  turn wraps up, and the row leaves with it. After `/clear` or `/resume` it
  stays empty until the next plan update.
- **A workflow's agents are not shown.** The engine does not list them.
- **Minutes move on the timer.** A count such as `3m` is redrawn every 30
  seconds, on a spawn, and when a turn ends.
- **The app can hide the band.** While one of the desktop app's question boxes
  waits for an answer, the app hides every band, this one included.
- **`waiting` is the engine's word.** It marks an agent held on background
  work of its own, on a plan's approval, or on another agent. It does not
  always mean the agent is waiting for you.
- **Width is counted in terminal cells.** A CJK character counts as two. In the
  desktop app, whose font is proportional, the count is an estimate.
- **Watched in the desktop app only.** In the terminal the rows are covered by
  the tests and have not been watched in a real session.

## License

MIT
