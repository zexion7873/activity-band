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
  latest progress summary, status and start time.
- It keeps both in the session's state, in memory, and draws them as text
  above the prompt.
- It writes no file and nothing to the per-plugin store.
- It makes no network request and no model call, and runs no process.
- The calls it watches pass through with their arguments and results
  untouched.

### In scope

- The mod changing, delaying or blocking a tool call or an agent spawn it
  watches.
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
