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
7. Use the `reviewer` subagent on the full branch diff. It works from `docs/review-checklist.md`: first an inventory of stateful pieces, then a behaviour pass (interleavings, gates, gestures, round trips, validated paths), then hygiene (ignored errors, pagination, partial-failure ordering, test teardown, leaks). Commit: `unit $ARGUMENTS: review`. If it logs open issues it couldn't fix in scope, list them in the PR body and check each has a Carried forward line under the unit of docs/plan.md that should own it.
8. Push and open a PR with `gh pr create`, body summarizing the handoff note and listing Human check items.
   - **Request a Copilot review:** `gh api -X POST repos/{owner}/{repo}/pulls/<number>/requested_reviewers -f 'reviewers[]=Copilot'` (`gh pr edit --add-reviewer` errors on this repo).
   - **Confirm it:** look for a `review_requested` event for `Copilot` in `gh api repos/{owner}/{repo}/issues/<number>/timeline`. If the REST call returned but no event appears, use GraphQL `requestReviewsByLogin` with `botLogins: ["copilot-pull-request-reviewer"]` on the PR's node id.
   - **When Copilot's comments arrive:**
     - Have `builder` verify and fix them (write the failing test first), then commit, push, reply on each thread and resolve it.
     - Treat every comment as a miss by the stages: for each one, ask which checklist row should have caught it. If no row covers its class, add one to `docs/review-checklist.md` (the general class, with this miss as its example) in the same commit.
9. Report:
   - What shipped, test counts and the QA verdict.
   - Review findings, Human check items for me, and anything left open.
   - How many comments Copilot left, and which checklist rows were added because of them.

Stop and ask me before anything outside this unit's scope, and before any step the plan marks as a Human check.
