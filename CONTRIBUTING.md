# Contributing

Read [AGENTS.md](AGENTS.md) first: it lists what the band must keep doing and
which test pins each. The traps below are the ones that make a correct change
look broken, or a broken one look fine.

## Three things that will cost you an afternoon

**The plan row cannot be exercised from a terminal.** It follows a task-list
tool that only the desktop app gives Claude, so a terminal session never fires
the hook. The tests call the hook with that tool's arguments directly. To look
at the real row, load the checkout in the desktop app and run a turn that
keeps a task list.

**An edit is not live while the turn that made it is still running.** A
checkout loaded through `CLAUDE_CODE_PLUGIN_DIRS` reloads when that turn ends.
An installed copy does not reload at all: it changes only when a new version
lands on `main` and you run `claude plugin update`. A fix that tests green and
is absent from the band is usually one of these two.

**The checks depend on the Claude Code version that runs them.** CI pins one,
named in the README's install section. An older one refuses a type the mod
uses: 2.1.325's `AgentInfo` has no `startTime`, and `--strict` fails on it.
`tsc` has nothing to check against until the mod has loaded once from the
checkout, because the engine writes the types then.

## Working on it

```bash
claude --plugin-dir plugin               # run the checkout for one terminal session
claude plugin validate .
claude plugin validate --strict plugin
claude plugin test plugin
```

A fresh clone runs all of it with no secrets and no install step beyond
Claude Code itself.

"Verified" means: the three checks pass, and **you watched the band in the
desktop app during a turn with a task list and a running subagent**. A green
test is one more kind of evidence, not a replacement for looking.

## Pull requests

Do not open a pull request you could not explain line by line if asked. That
rule, and the two beside it, are in the
[Code of Conduct](CODE_OF_CONDUCT.md#send-work-you-understand).

Conventional Commits (`feat:` / `fix:` / `refactor:` / `docs:` / `chore:` /
`test:` / `perf:`), in English, saying WHY rather than WHAT. One logical change
per commit.

If your change alters behaviour, interfaces, or project state, the docs it makes
stale are part of the diff: the README's rows example, its "What it reads and
writes" table and its limits; the list of what the band must keep doing in
AGENTS.md; and the "What this plugin does" section of SECURITY.md.
