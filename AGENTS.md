# Working on activity-band

A Claude Code mod: a plugin of function hooks, one module
(`plugin/hooks/register.tsx`) plus the pure plan reducer it imports
(`plugin/hooks/plan.ts`). No package manager, no dependencies. `README.md`
covers what it does for a user; this file covers the traps.

## `plugin/` is what ships

The repo root is the marketplace; `plugin/` is the plugin
(`source: "./plugin"`). Docs and CI live outside it so they stay out of an
install and out of the plugin directory's review.

## What the band must keep doing

Each is pinned by a test in `plugin/tests/band.test.ts`, except where a line
says otherwise.

- **Render what is beneath.** The `AbovePrompt` hook awaits `next(e)` and
  returns it above its own rows; dropping it erases whatever another mod drew
  on this row.
- **Draw nothing with no plan and no agent at work.** An empty `plan 0/0`
  reads as a broken mod.
- **Record only a call that went through.** A plan call that was refused
  changes nothing. The same guard skips one that errored, which no test covers.
- **Never fail what it watches.** The `tool.call` and `agent.spawn` hooks
  return the result of `next(e)` whatever happens to their own recording: each
  write ends in `.catch`. No test yet: in the harness a failing `agent.list`
  does not fail the spawn with or without the catch.
- **Ignore a subagent's plan calls.** A call with an `agentId` is not the plan
  the user sees.
- **Empty the plan row at wrap-up.** The app checks the whole list off there,
  and sends no plan update saying so.
- **Filter the agent list by status.** The engine keeps a finished agent
  listed, and a subagent's own `turn.complete` already finds it `completed`.
- **Keep the timer.** An agent can stop with no event this mod hears, and the
  elapsed minutes are computed while drawing, so `session.start` arms
  `$.clock.every(30_000, …)`.
- **Keep each terminal row to one line.** Each row is one `Text` with
  `wrap="truncate-end"`; sibling Texts wrap into columns once the line
  overflows.
- **Step aside for a survey.** `e.props.hasSurvey` returns `below` untouched.
  No test yet.

The desktop hover cards are pinned for the plan row only; the agents row's
card has no test and has not been watched in the app.

## The plan source is not a documented interface

The plan row hooks two tools the desktop app registers:
`mcp__ccd_turn__update_plan` and `mcp__ccd_turn__wrap_up`. A mod's `tool.call`
hook hears them with the tool's arguments spread on `e` (measured on 2.1.330).
`update_plan` takes `items` (the whole list, replacing the last), or
`advance: true` (finish the step in progress, start the next pending one), or
`done` and `start` (step numbers, counted from 1). `applyPlan` in `plan.ts` is
that reading, and a list that does not fit it leaves the plan as it was.

No terminal session has these tools, so the plan row cannot be exercised from
one: the tests call the hook with the arguments directly, and a look at the
real row needs the desktop app.

## `plugin/hooks/plan.ts` stays plain

It must not import `claude-code` values: the reducer is tested as a plain
function, and its input is model-written JSON it has to check for itself.

## Changes reach a session by two different paths

- **The checkout:** `claude --plugin-dir plugin` for one session, or the
  `plugin` directory's path in `CLAUDE_CODE_PLUGIN_DIRS` for every session,
  loads it as `activity-band@inline`. A mod loaded this way hot-reloads when
  the turn that changed a module ends, not while it runs.
- **The installed copy:** `activity-band@activity-band` from the marketplace
  is keyed by the `plugin.json` version. Edits reach it only after a version
  lands on `main` and the user runs `claude plugin marketplace update
  activity-band` and `claude plugin update activity-band@activity-band`.

## Commands

```bash
claude plugin validate .                 # the marketplace manifest only; it does not descend into plugin/
claude plugin validate --strict plugin   # the plugin and every engine call it makes; warnings fail
claude plugin test plugin                # plugin/**/*.test.ts in the engine's harness
(cd plugin && tsc -p .)                  # only after the mod has loaded once from this checkout
```

`plugin/.claude-plugin/types/` is written by the engine when the mod loads and
is gitignored; `plugin/tsconfig.json` extends it, so `tsc` has nothing to
extend on a fresh clone.

Two traps in the checks:

- A Claude Code older than the CI pin can fail `--strict` on a type the mod
  uses: 2.1.325's `AgentInfo` has no `startTime`, while 2.1.330's types and
  runtime both do.
- In a session with many MCP connectors, the engine lays their tools into the
  types and the typed `$.tool.call` union becomes too deep for `tsc` (TS2589)
  where a test calls an app tool. The test's `call()` helper casts for that
  reason; do not unwrap it.

## CI and releases

`.github/workflows/check.yml` installs Claude Code at a pinned version from
npm, then validates the marketplace and the plugin (strict) and runs the
tests, on every PR and push to `main`. The pin is the version the README's
install section names; bump both together.

The version line in `plugin/.claude-plugin/plugin.json` landing on `main` is
the publish; a tag or a GitHub release publishes nothing.
