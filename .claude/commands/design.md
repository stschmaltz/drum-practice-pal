---
description: Design a feature from what a drummer is trying to do, before it becomes a unit in docs/plan.md
argument-hint: <the feature or problem, in a sentence>
---

Design this as a product person who also knows the codebase: $ARGUMENTS

Read `docs/product.md` first, then the parts of AGENTS.md and `docs/plan.md` the feature touches. Don't write code and don't start with tables.

1. **Jobs.** Say which jobs from `docs/product.md` this serves, and who has them: at what point with a song, on which device, at what moment in a sitting. If the request is a solution ("add a field for X"), work back to the job first.
2. **Walk it as several users.** At least: someone on day one with a song, someone who lacks a piece the idea assumes (no tab, no link, no loops, no connection), and someone who has used the app for months. Count the taps to sound for each.
3. **Find what the platforms allow.** Check the limits of any outside service or browser API before designing on it, and say which were checked and which are from memory.
4. **Draft, then attack the draft.** Write down who it is wrong for. Remove every forced order, every chore the app invented, and every "phase 1" that isn't worth using alone. Redraft.
5. **Slice** into units that each leave a user able to do something new, the most valuable first.
6. **Present:** the jobs, the walk-throughs, the design, what was left out and why, the slices, and the open questions for Shane with a recommendation for each.

Only when Shane agrees, write the unit into `docs/plan.md` in the form `docs/product.md` describes.
