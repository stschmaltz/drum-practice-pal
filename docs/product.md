# Product thinking

Read this before designing a feature, writing a unit into `docs/plan.md`, or building one. The plan says what to build; this says who it is for and how to tell a good design from a tidy one.

## Who uses it

A drummer at a kit or a practice pad, sticks in hand, with a phone on a stand, a tablet on a music stand or a laptop nearby. They have 20 to 60 minutes. They did not sit down to manage data.

They are not all at the same point with every song:

- A song they heard yesterday and want to bash through today, badly, to find out what is in it
- A song they are learning, with two or three hard parts
- A song they have down and play to keep it
- A song with a good tab, a song with a bad tab, a song with no tab at all
- A song they only have as a link someone sent

## What they come to do

Name the job before the data model. The ones we know:

1. **Play the song now.** Any song, at any stage, in one or two taps from opening the app. With the drums in to hear the part, with the drums out to be the drummer.
2. **Find the hard parts.** Play along while still bad at it, notice where it falls apart, and keep that spot so it can be worked on.
3. **Work a hard part.** Loop it slowly, speed it up over days, see that it is getting faster.
4. **Read along.** See the part while hearing the song, synth or real.
5. **Keep a song.** Come back to a song they have down, without setup.
6. **Pick up where they left off**, on whichever device is nearest.

A feature that serves none of these needs a reason written beside it.

## Rules for a design

- **No forced order.** People practise out of order: the full song before any loop, a loop for a song they will never finish, a finished song again from scratch. Never gate one way of practising behind finishing another. The app may suggest a next step; it never requires one, and a suggestion is never the only door to a feature.
- **Every piece is optional.** A song may have no tab, no recording, no loops, no drum track. Design each feature for the song that lacks the other pieces, and say what the screen shows then. "Needs a tab" is a limit to remove, not a starting assumption.
- **Count the taps to sound.** From opening the app to hearing the thing, and from one thing to the next. Hands are holding sticks; the phone is at arm's length. Write the count into the unit.
- **Don't invent chores.** The app records what it can see happen. A button whose only purpose is to tell the app what the user just did (log this, rate that, confirm the other) needs evidence that the user wants the record. When in doubt leave it out and ask.
- **Slice by what a user can do, not by layer.** The first slice of a feature must already be worth using on its own: not "store the links" now and "do something with them" later. If the valuable part is in phase 3, the phases are in the wrong order.
- **Design around a platform's limits in the open.** When a service can't do something (no speed control, no embedding for some videos, nothing offline), say so in the unit, decide what the user sees at that moment, and never let the limit pick the feature's shape by default.
- **Try to break your own draft before showing it.** For each draft ask: who is this wrong for? Walk it as the beginner on day one, the player with no tab, the player with twenty songs down, the player offline at the jam space. A design that only works for the user who follows the intended path is not done.
- **Shane is one user, and the one we can ask.** When a choice turns on how someone really practises, say what you would pick and why, and ask. Don't settle it by what is easiest to build, and don't ask about what the code or a default can answer.

## What a unit's section says, beyond scope and acceptance

- **For whom and when:** which of the jobs above, and the moment in a sitting it happens.
- **The walk-through:** the steps and taps for the main case, and for at least two users it must not fail (one of them missing a piece: no tab, no link, no loops, no connection).
- **What we chose not to build, and why,** so a later agent doesn't add it back as an oversight.
- **Open questions for Shane,** each with a recommendation.
