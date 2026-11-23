---
description: Run one unit from docs/plan.md through Build, Test, QA, Readability and Review
argument-hint: <unit number, e.g. 03>
---

Run Unit $ARGUMENTS from docs/plan.md through the full pipeline. You are the orchestrator: delegate the work, don't do it yourself.

1. Create and switch to branch `unit-$ARGUMENTS` from main.
2. Use the `builder` subagent for Unit $ARGUMENTS. Commit: `unit $ARGUMENTS: build`.
3. Use the `tester` subagent. Commit: `unit $ARGUMENTS: tests`.
4. Use the `qa` subagent. Commit: `unit $ARGUMENTS: qa`.
5. If QA reports blocker or major issues: use `builder` to fix exactly those, then `tester` and `qa` again on the affected area. Repeat at most twice, then stop and report to me.
6. Use the `readability` subagent. Commit: `unit $ARGUMENTS: readability`.
7. Use the `reviewer` subagent on the full branch diff (PR-reviewer level: ignored errors, pagination, partial-failure ordering, test teardown, leaks). Commit: `unit $ARGUMENTS: review`. If it logs open issues it couldn't fix in scope, list them in the PR body and check each has a Carried forward line under the unit of docs/plan.md that should own it.
8. Push and open a PR with `gh pr create`, body summarizing the handoff note and listing Human check items. Then finish the review step by requesting a Copilot review on the PR: `gh api -X POST repos/{owner}/{repo}/pulls/<number>/requested_reviewers -f 'reviewers[]=Copilot'` (`gh pr edit --add-reviewer` errors on this repo). Confirm a `review_requested` event for `Copilot` in `gh api repos/{owner}/{repo}/issues/<number>/timeline`. Address Copilot's comments when they arrive.
9. Report: what shipped, test counts, QA verdict, review findings, Human check items for me, anything left open.

Stop and ask me before anything outside this unit's scope, and before any step the plan marks as a Human check.
