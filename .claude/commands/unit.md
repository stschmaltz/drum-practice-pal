---
description: Run one unit from docs/plan.md through Build, Test, QA and Readability
argument-hint: <unit number, e.g. 03>
---

Run Unit $ARGUMENTS from docs/plan.md through the full pipeline. You are the orchestrator: delegate the work, don't do it yourself.

1. Create and switch to branch `unit-$ARGUMENTS` from main.
2. Use the `builder` subagent for Unit $ARGUMENTS. Commit: `unit $ARGUMENTS: build`.
3. Use the `tester` subagent. Commit: `unit $ARGUMENTS: tests`.
4. Use the `qa` subagent. Commit: `unit $ARGUMENTS: qa`.
5. If QA reports blocker or major issues: use `builder` to fix exactly those, then `tester` and `qa` again on the affected area. Repeat at most twice, then stop and report to me.
6. Use the `readability` subagent. Commit: `unit $ARGUMENTS: readability`.
7. Use the `reviewer` subagent on the full branch diff (PR-reviewer level: ignored errors, pagination, partial-failure ordering, test teardown, leaks). Commit: `unit $ARGUMENTS: review`. If it logs open issues it couldn't fix in scope, list them in the PR body.
8. Push and open a PR with `gh pr create`, body summarizing the handoff note and listing Human check items.
9. Report: what shipped, test counts, QA verdict, review findings, Human check items for me, anything left open.

Stop and ask me before anything outside this unit's scope, and before any step the plan marks as a Human check.
