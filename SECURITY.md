# Security Policy

## Reporting a vulnerability

**Do not open a public issue.** This repository is what people install the mod
from, so a flaw described in public is one every install has until it updates.

Use [GitHub's private vulnerability reporting](https://github.com/zexion7873/activity-band/security/advisories/new).

This is a one-person project. You will get a first response within a few days,
not within hours. A fix ships as a new version on `main`; an install picks it
up with `claude plugin update`.

## Supported versions

Only the latest version on `main`. There are no maintenance branches.

## What this plugin does

Worth knowing before you decide whether something is in scope.

- It reads the arguments of two tool calls the desktop app makes for Claude:
  the task list (each step's text and status) and the turn's wrap-up, of which
  it uses only whether the call succeeded.
- It reads the session's agent list: each agent's id, type, description,
  latest progress summary, status, start time, parent agent, model, context
  window, cost estimate, token count with its recent readings, and the time
  of its last request.
- It hears each turn start, of which it uses only whether the turn is the main
  conversation's or a subagent's. It does not read the prompt.
- It keeps the task list, the agent list and whether the task list was left by
  an earlier turn in the session's state, in memory, and draws the two lists as
  text above the prompt.
- It writes no file and nothing to the per-plugin store.
- It makes no network request and no model call, and runs no process.
- The calls and turn starts it watches pass through with their arguments and
  results untouched.

### In scope

- The mod changing, delaying or blocking a tool call, an agent spawn or a turn
  start it watches.
- Anything it read leaving the machine or being written to disk.
- A step text, agent description or progress summary that makes the band draw
  something other than that text.

### Out of scope

- Misleading text in a step, a description or a progress summary. The mod
  shows what the model wrote, as written.
- The plan row going quiet because the desktop app changed its task-list tool.
  That is a compatibility bug: open a normal issue.
- Anything that needs an attacker who already controls the machine, the Claude
  Code session, or this repository.
