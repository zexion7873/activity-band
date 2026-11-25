# activity-band: install guide for AI agents

activity-band is a Claude Code mod (a plugin of function hooks): two rows above
the prompt showing the plan step in progress and the subagents still running.
Follow these steps to install it on the user's machine.

## 1. Preflight

```bash
claude --version
```

The mod needs a Claude Code build with function-hook plugins. CI validates and
tests it against 2.1.330. On 2.1.325 the engine's types lack a field the mod
reads, an agent's start time, and older builds are unmeasured. If the user's
version is older, tell them so and suggest updating Claude Code first. Do not
install and hope.

## 2. Say what they will see

The plan row follows a task-list tool that only the desktop app gives Claude.
If the user works in a terminal alone, tell them before installing that they
get the agents row and no plan row.

## 3. Install

The `/plugin` command in the README is a REPL slash command and won't work
from a shell. Use the CLI:

```bash
claude plugin install activity-band --marketplace zexion7873/activity-band
```

`--marketplace` adds the marketplace first when it is not there yet. `install`
defaults to the user scope, which is the one that also reaches sessions the
desktop app starts. Do not pass `--scope project` or `local` unless the user
asked for it.

## 4. Verify

```bash
claude plugin list | grep -i -A3 activity-band
```

Look for `activity-band@activity-band` with `Status: ✔ enabled`. There is
nothing to configure.

The band draws nothing with no plan and no agent at work, so an empty space
above the prompt after installing is not a failure. A session gains a plugin
only at session start, so the rows do not appear in sessions that were already
open, usually including the one you are running in. Tell the user what to
expect in their next session: the plan row during a turn that keeps a task
list, in the desktop app, and the agents row while a subagent runs.

## Update

An installed copy is keyed by its version and does not follow `main` by
itself:

```bash
claude plugin marketplace update activity-band
claude plugin update activity-band@activity-band
```

The new version applies to sessions started after the update.

## Uninstall

```bash
claude plugin uninstall activity-band@activity-band
```

The mod writes no file and keeps nothing in the per-plugin store, so there is
nothing else to remove.
