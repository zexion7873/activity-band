## What and why

<!-- What changed, and what it fixes or adds. WHY rather than WHAT: the diff
     already says what. If it fixes an issue, link it. -->

## How you know it works

<!-- Delete the lines that do not apply. -->

- [ ] `claude plugin validate .`, `claude plugin validate --strict plugin` and
      `claude plugin test plugin` pass.
- [ ] I loaded the checkout in the desktop app and watched the band during a
      turn with a task list and a running subagent. What I saw:
- [ ] I changed a test, and **showed the old code fails it**: which case, and
      what it printed:
- [ ] I changed what a hook reads or writes, and the README's "What it reads
      and writes" table and SECURITY.md's "What this plugin does" say the same.

> [!IMPORTANT]
> Do not bump the version line in `plugin/.claude-plugin/plugin.json`. That
> line landing on `main` is the publish.

## Merge danger

<!-- Door: two-way if reverting this PR undoes it; one-way if it cannot be
     walked back (data deleted or rewritten, something published). Blast
     radius: who or what breaks if this is wrong. -->

- **Door:**
- **Blast radius:**

## Docs this makes stale

<!-- Which docs does this change invalidate? "None" is a fine answer; say it
     out loud rather than leaving this blank. CONTRIBUTING.md lists the ones
     that usually go stale. -->
