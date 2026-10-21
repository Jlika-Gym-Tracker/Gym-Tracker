# Changelog

## Unreleased — `feat/opengym-features`

Training depth, history, a full exercise library and operator tools — feature
ideas taken from [openGym](https://github.com/alexpcosta/opengym) and written
fresh for this codebase (openGym is AGPL-3.0; none of its code, text or data is
used). Database changes are migrations `20261020000027` – `35`; see
[Upgrading](#upgrading).

### Logging a workout

- **Progression rules.** Each day picks one — double progression (default),
  linear, Greyskull LP, or off — and any exercise can override it and set its
  own load step. Timed holds progress by adding time. Every set is judged
  against the plan the session followed; missed or unticked sets count as
  misses, three misses in a row deload 10 %, bodyweight work progresses in
  reps, big lower-body lifts take a 5 kg / 10 lb step. Loads round in the
  units you lift in.
- **The rule explains itself** on every exercise card ("Top of the range on
  every set at 60 kg — add 2.5 kg"), pre-fills the session's loads, and drives
  "Copy last week".
- **Last time** on each card — last session's sets, so the number to beat is
  beside the rows.
- **Timed holds** (planks, hangs, carries) with a hold clock that chimes at the
  target and logs the time actually held. **Cardio** logged as minutes and
  distance, with speed shown. Planks, carries, treadmills, bikes and rowers
  are marked in the library to log that way.
- **Supersets** — paired in the builder, run back to back, rest only after the
  last one.
- **Rest timer** with −15 s / +15 s, a progress fill, a chime and a buzz at
  zero, and a background push when notifications are on.
- **Keep the screen awake** while a session is open.
- **Effort per set** in RPE or RIR, or off; always stored as RPE, so switching
  never rewrites a logged set.
- **Weigh in first?** at the start of a session, which also records the day's
  weigh-in without overwriting one.
- **Records** judged against everything logged before (not just the last few
  sessions, and no longer cut off at 1000 sets). Estimated 1RM refuses to guess
  past 12 reps; past that, a heavier bar is the record. A **1RM calculator** in
  the exercise drawer and on every exercise page.
- **Finish summary** — duration, volume, new bests, the muscles you trained —
  with an optional "how did that feel?" and a note.
- **Train something else** from Today: any day of the week or freestyle,
  without touching the plan.
- Fixed: the *auto-rest* and *show estimated 1RM* settings existed but nothing
  read them.

### Planning

- **Paste a week the way people write it** — "Monday - Upper A" headers,
  "3 × 10 each", holds ("Plank: 3 × 30–60 sec") and cardio ("Cardio: 15 min
  incline treadmill walk"). Lines the library doesn't have can be kept as your
  own exercises; days left out become rest days.
- **Add exercise** opens a search inside the day card, with "add as my own"
  for anything the library lacks.
- **5×5 linear** and **Greyskull LP** starter programs that come with their
  progression rule.
- **Your own exercises** — a name and a muscle is enough; edit them later, and
  remove them (deleted if never logged, archived otherwise so history keeps
  them).
- **Equipment filter** in the library, offering only what has results.
- **Share a week** as a small file (routine only — never logs or loads),
  **import** someone's (fills only your empty days), or **print** it / save as
  PDF.
- **What a day hits** — a muscle-map preview beside the builder.
- Loads in the builder show and save in your own units (imperial accounts
  were shown kg).

### History, stats and the library

- **History** — every finished session on a month calendar; open, **edit** or
  **delete** any of them. Fixing a set corrects future targets too.
- **Exercises** — the whole public-domain free-exercise-db library (~750
  movements: ~80 curated *featured* ones first, stretches left out), searchable
  from the top bar, with a page per exercise: how-to, muscles, your best set,
  estimated-1RM curve, last sessions, calculator, "Add to a day". Featured
  movements and your own win close calls in paste, import and search.
- **Progress** gains a year-long **activity heatmap** (tap a day → History),
  a **muscle map** (week / 30 days / all time; all sets or hard sets only;
  male or female figure), an **effort** card, a per-lift **estimated-1RM
  curve**, and your **goal weight** line on the weight charts.
- **Week streak** in the top bar and your weight against the goal in the
  sidebar — both were placeholders before.

### Bringing data in and out

- **Import history** from Strong, Hevy or FitNotes, body weight from Apple
  Health, or **restore this app's own backup** (JSON or ZIP). Re-importing never
  duplicates, and weigh-ins never overwrite a day.
- **Export** now contains only your own rows (a coach's export used to include
  athletes' data), every row (it stopped at 1000 per table), the planned
  exercises (missing before) and your AI Coach history.

### Notifications

- Optional **web push**: rest-timer alerts in the background, and a reminder
  on training days you haven't started by an hour you pick, in your own time
  zone. Needs VAPID keys.

### AI Coach (optional)

- Off unless the server has `ANTHROPIC_API_KEY`, and opt-in per account. It
  drafts a week from a short intake (refine it in plain words), or reviews the
  last four weeks and proposes discrete changes you accept one by one. Every
  apply snapshots the week first and can be reverted; it only ever writes
  drafts and never touches logged sessions. The README lists exactly what is
  sent and what never is.

### Settings and appearance

- A new **Training** tab gathers the workout settings and notifications (they
  were under *Data & privacy*).
- **Accent colour** — eight to choose from; lime stays the default and the app
  stays dark.
- **Sign out everywhere**.

### Operators

- **Admin dashboard** for addresses in `ADMIN_EMAILS`: totals, who is training
  right now, accounts with sign-in and session counts — never any training,
  body or nutrition data. Disable / re-enable accounts.
- **Invite-only signup** with codes the dashboard generates and revokes,
  enforced in the database.

### Fixes along the way

- A coach's own progression history, PR bests, weigh-in prompt and "resume
  session" could pick up their athletes' rows; every query those use now names
  the signed-in user.
- The program and signup pages no longer ship zod or the Supabase client to
  the browser, which they didn't need.

### Upgrading

1. Apply migrations **0027 – 0035**: `npm run db:apply` (needs a valid
   `SUPABASE_ACCESS_TOKEN`), or paste `supabase/apply-all.sql` into the SQL
   editor — about 820 kB, most of it the exercise library (0033); if the
   editor struggles, run 0033 on its own. **0030** (workout-day reminder cron)
   is optional and applied separately; see *Scheduled jobs* in the README.
2. Optional environment variables (`.env.example`): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` for push; `ANTHROPIC_API_KEY`,
   `AI_COACH_MODEL`, `AI_COACH_DAILY_LIMIT` for the AI Coach; `ADMIN_EMAILS`
   for the operator dashboard. Each feature stays hidden without its keys.
3. Restart the dev server after changing environment variables.
