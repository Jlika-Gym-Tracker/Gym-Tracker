# JLIKA Gym

A private web app for tracking gym training, body progress and nutrition.
One account per person — every row is owned by a user and nobody can read
anyone else's data.

Design source of truth: `design/JLIKA Gym.dc.html` in the handoff folder.
Dark near-black surfaces, lime accent `#c9f24d`, Archivo for UI text,
JetBrains Mono for numbers and eyebrows.

## Stack

Next.js 15 (App Router, RSC by default) · TypeScript · Tailwind CSS v4 ·
shadcn/ui restyled to the JLIKA tokens · Supabase (Postgres, Auth, Storage,
RLS on every table) · Server Actions with zod · Recharts · date-fns · Vitest.

## Getting started

```bash
nvm use                # Node 20 (see .nvmrc)
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com), then copy the
   Project URL and publishable key from **Project Settings → API** into `.env.local`.
2. Apply the schema. With a Management API token (`sbp_…`, from
   [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)) in
   `.env.local` as `SUPABASE_ACCESS_TOKEN`:
   ```bash
   npm run db:apply            # every migration, in order
   npm run db:apply -- league  # or just the ones matching a name
   ```
   Every migration is idempotent, so re-running is safe. Without a token, paste
   `supabase/apply-all.sql` into the SQL editor instead (`npm run db:bundle`
   regenerates it), or use the Supabase CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. **Auth → URL Configuration**: set the Site URL to `http://localhost:3003`
   and add `http://localhost:3003/auth/callback` plus
   `http://localhost:3003/auth/confirm` as redirect URLs. The dev server is
   pinned to port 3003 (`next dev -p 3003`) precisely because this allow-list
   is exact-match — a drifting port silently breaks magic links.
4. **Auth → Providers**: enable Google if you want the Google button to work —
   it is off by default and the button errors until you turn it on.
   Email/password and magic links are on by default. Email confirmation is on
   by default too, so signup asks you to click a link before you get a session.
5. Regenerate types after any schema change:
   ```bash
   supabase gen types typescript --linked > lib/database.types.ts
   ```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright smoke tests (builds into `.next-e2e`) |

Regenerate the exercise seed (and its test fixture) from free-exercise-db:

```bash
curl -sL https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json -o /tmp/fedb.json
node scripts/generate-exercise-seed.mjs
```

## Layout

```
app/
  (app)/            App shell — sidebar + top bar. Everything behind auth.
  (auth)/           Sign in, sign up, forgot password. Split layout.
  auth/             Route handlers: OAuth callback, magic-link confirm.
  actions/          Server Actions, one file per domain, all zod-validated.
components/
  shell/            Sidebar, top bar, logo, avatar.
  kit/              Design-system pieces shared across screens.
  ui/               shadcn primitives.
lib/
  supabase/         server / browser / middleware clients.
supabase/migrations/
```

## Writing a week

The program is always yours. Nothing is generated unless you switch on the
optional [AI Coach](#ai-coach), and even then nothing lands without your
approval. Ways to fill a week:

| | |
|---|---|
| **Template** | Pick a split (3-day full body, 4-day upper/lower, 6-day PPL) and equipment; it fills a draft you edit. Fixed blueprints in `lib/program/templates.ts`, not generation — the same choice always gives the same week. |
| **Paste** | Plain text like `1 Incline Dumbbell Press 3 x 8-12`, fuzzy-matched to the library with a review step. |
| **Copy last week** | Duplicates the most recent week as a fresh draft. With *Step loads up* on (the default), every exercise runs its own [progression rule](#progression-rules) on what you logged — the same reading the session screen gives. |
| **Import a week** | A `.jlika-week.json` file someone shared. It only fills days you have left empty, so it never overwrites your plan. |
| **AI Coach** | Optional. Describe yourself in a short intake and review a proposed draft before it is saved. |
| **Blank** | Build it by hand from the library, including movements of your own (a name and a muscle is enough). |

Each exercise is logged one of three ways, set on the movement: **weight × reps**,
**time held** (planks, hangs, carries — with an optional load), or **cardio**
(minutes and distance). Exercises can be paired into **supersets** from the
exercise's edit panel; the session runs them back to back and rests after the
last one. **Share this week** downloads the routine — days, exercises, sets,
reps, holds, supersets and rules, never your logs or loads — and **Print**
opens a clean page the browser can save as a PDF.

## Progression rules

`lib/program/prescription.ts` decides each session's target from what was
logged — a pure function, so fixing a mistyped set or switching rule takes
effect at once. A day picks a rule and any exercise can override it:

| Rule | Moves the load when… |
|---|---|
| **Double progression** (default) | every set reaches the top of the rep range — then up a step, reps back to the bottom. A range cleared at RPE ≥ 9.5 holds instead. |
| **Linear** | every rep of every set was done. |
| **Greyskull LP** | every set hit the target, with the last set to failure; doubling the target there earns a double jump. One miss resets 10 %. |
| **Add time** | (timed holds) every set was held the full time — then +5 s. |
| **Off** | never; loads stay where you set them. |

Ticked sets short of the target, and planned sets never ticked, count as
misses. Three sessions of misses in a row deload 10 % onto a loadable step
(Greyskull: one). Bodyweight work progresses in reps, never in kilos. Each
session is judged against the plan of the day it followed, not today's.
Big lower-body lifts take a 5 kg (10 lb) step, everything else 2.5 kg (5 lb),
unless the exercise sets its own. Loads round in the units you lift in.

## Logging a session

- **Pre-filled loads** come from the rule, else the plan, else last time; the
  rule's verdict and reason sit on each exercise card.
- **Effort per set** asks in RPE or RIR, or not at all (Profile → Data &
  privacy). It is always stored as RPE (RIR = 10 − RPE), so switching never
  rewrites a logged set.
- **Rest timer**: starts on a tick when auto-rest is on, with −15 s / +15 s, a
  chime and a buzz at zero, and (with notifications on) a push when the app is
  in the background.
- **Hold clock** for timed sets: counts up, chimes at the target, and logs the
  time actually held.
- **Keep screen awake** while a session is open (on by default).
- **Weigh in first?** at the start of a session also records the day's
  weigh-in, never overwriting one already logged.
- **Records** compare against everything logged before, not just recent
  sessions. Estimated 1RMs (Epley) refuse to guess past 12 reps; above that a
  heavier bar is the record. The exercise drawer has a 1RM calculator.
- **Finish** lands on a summary — duration, volume, new bests, what you
  trained on the muscle map — with an optional "how did that feel?".

## Progress and stats

The Progress page adds a year-long **activity heatmap** (shaded by time
trained), the **goal weight** line (Profile → Account) with changes coloured by
whether they moved toward it, a **muscle map** (week / 30 days / all time; all
sets or only hard ones), an **effort** card that always shows how much of your
training was rated, and a per-exercise **estimated-1RM curve** that names the
set each point came from. The muscle map is drawn from
[MuscleMap](https://github.com/melihcolpan/MuscleMap) (MIT) — see
`THIRD_PARTY_NOTICES.md`; `scripts/generate-body-paths.mjs` regenerates it.

## Bringing your history

Profile → Data & privacy → *Bring your history* reads a **Strong**, **Hevy**
or **FitNotes** CSV export, or body weight from an **Apple Health** export
(`export.xml` or the zip). Files are parsed in the browser; a review step
matches each exercise name to your library and turns the rest into your own
exercises. Re-importing the same file skips workouts already there, and
imported weigh-ins never overwrite a day that already has one.

## Notifications

Optional web push: rest-timer alerts with the app in the background, and a
reminder on training days you have not started by a chosen hour. Generate keys
once with `npx web-push generate-vapid-keys` and set
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and
`SUPABASE_SECRET_KEY`; without them the settings say push isn't configured.
iPhones need the app added to the home screen.

A rest alert keeps one server function alive for the length of the rest, so
`app/api/push/rest` asks for `maxDuration = 300` and rests over 280 s get the
in-app chime only. On a host that allows longer functions, raise that limit
together with `MAX_WAIT_MS` there and `MAX_PUSH_REST_MS` in
`lib/push/rest-alert.ts`. The reminder needs a scheduler — see
[Scheduled jobs](#scheduled-jobs).

## AI Coach

Optional, and absent unless `ANTHROPIC_API_KEY` is set on the server
(`AI_COACH_MODEL` defaults to `claude-opus-5-5`; `AI_COACH_DAILY_LIMIT` caps
runs per account per 24 hours, default 10). Each account opts in separately on
a consent screen and can withdraw. It can **design a week** from a short intake
and revise it in plain language, or **review** the last four weeks and propose
discrete changes (swap, add, remove, sets, reps, hold time, load, rule,
superset, rename), each with its reason — you tick the ones you want. Every
apply snapshots the week first and one tap reverts it; it writes drafts only
and never touches logged sessions or sets.

What leaves the server, on the instance owner's key, only when you press a
button that says so:

- **Designing a week:** the intake answers; sex, age and height only if you
  tick the box; the names of library movements that fit your equipment.
- **A review:** the current plan; per exercise, sets hit, missed and skipped
  against the plan, effort trend, sessions since it last improved and the last
  three sessions' sets; planned days against sessions done; session length;
  session ratings and notes (up to 12, trimmed); body-weight trend against the
  goal weight; untrained muscles; changes you turned down in the last 90 days.
- **Never:** database ids, email, name, avatar, photos, meal plans, crew or
  coach data. Exercises go by slug, days by position, sessions by date. Typed
  text is sent as data inside delimiters, never as instructions.

Generation runs in a server action with `maxDuration = 300`; lower it together
with `RUN_BUDGET_MS` in `app/actions/ai-coach.ts` on a host that caps lower.
`AI_COACH_FIXTURE=1` (development only) walks the whole loop on canned answers
without a key.

The beginner template deliberately prescribes less than the load check's weekly
set floor — that floor is tuned for an intermediate lifter in a deficit, and the
UI says so rather than showing an unexplained warning.

## Today's meals

Each meal row expands to the recipe: every ingredient with its portion and
calorie contribution, the method, and a servings stepper. Portions scale live,
so the number on screen is the number for the plate you are actually making.

Changing servings rewrites the grocery list — servings feed the aggregation, so
leaving it alone would put the shopping totals out of step with the plan they
come from.

`formatPortion` rounds to nearest; `formatQuantity` (the shopping list) rounds
up. A list should never send you home short, and a plate should not tell you to
eat three eggs when the recipe says 2.1.

## Imagery

Three sources, all hotlinked for now — **mirror them into Supabase Storage
before this serves real traffic**:

| Where | Source | Licence |
|---|---|---|
| Exercise photos | [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | Public domain |
| Ingredient photos | [TheMealDB](https://www.themealdb.com) | Free tier; check terms for commercial use |
| Auth / onboarding panels | Unsplash | Placeholder — replace with real photography |

Four ingredients are deliberately left without a photo because the source had
the wrong food for them. `FoodThumb` draws a category-coloured tile instead —
no picture beats a misleading one. Meals have no photo of their own either;
`mealImage` shows the meal's main protein, which is at least true about what is
on the plate, rather than a stock photo of some other dish.

## Coaching

An account can also coach. `profiles.coaching_enabled` turns it on; a coach
writes reusable programs and assigns one into an athlete's week.

The sharing boundary is the important part, and it lives in one place —
`coach_can_read(athlete, scope)`:

| Scope | Default | What it exposes |
|---|---|---|
| `training` | **on** | Program, sessions completed, every set / load / RPE |
| `body` | off | Weigh-ins and measurements |
| `photos` | off | Progress photos (and the matching Storage policy) |
| `nutrition` | off | Targets and meal plan |

Only the athlete can change these, enforced by RLS as well as by the action.
Ending a link revokes everything immediately.

**Writing new SECURITY DEFINER functions:** revoke from `anon` *and*
`authenticated` explicitly, then grant back only what the app calls. Supabase's
default privileges grant EXECUTE on new functions to both, and
`revoke ... from public` does not undo that.

## Conventions

- Server Components fetch data; Client Components only where there is
  interaction (set logging, drag-reorder, photo slider, checkboxes).
- All weights stored in kg, all lengths in cm — convert at the display edge
  from `profiles.unit_system`.
- `program_exercises.target_weight_kg` is the *planned* load and may be null.
  `set_logs` remains the record of what was actually lifted; editing a plan
  never rewrites it.
- Anything day-scoped (weigh-ins, photos, plans) is a `date`, never a
  timestamp, to avoid timezone drift.
- No `any`.
- Filter sessions, sets and weeks to the signed-in user explicitly. A coach's
  RLS also lets them read their athletes' training, so a query that leans on
  RLS alone can mix an athlete's rows into the coach's own screens.

## Build phases

1. **Foundation** — scaffold, tokens, app shell, Supabase clients, auth, `profiles` + RLS ✅
2. **Program** — weeks/days/exercises, 71-movement seeded library, drag-reorder builder, paste parser with a review step, publish, copy last week ✅
3. **Session logging** — live set rows, rest and elapsed timers, running volume, exercise drawer, progression hints ✅
4. **Body progress** — private photos, comparison slider, measurements, weight and strength trends ✅
5. **Nutrition** — TDEE targets, meal plan, swaps, grocery list, hard allergy filters ✅
6. **Profile, crew & settings** — five tabs, invite codes, sharing controls, export, account deletion ✅
7. **Crew league** — seasons, scoring, standings, challenges, badges, nightly job ✅
8. **Polish** — onboarding, skeletons, keyboard shortcuts, PWA, weekly email, smoke tests ✅
9. **Training depth** — progression rules, timed/cardio logging, supersets, effort scales, heatmap, muscle map, history import, push, sharing, AI Coach ✅

Phase 9's feature set was inspired by
[openGym](https://github.com/alexpcosta/opengym). openGym is AGPL-3.0; none of
its code, text or data is used here — every feature was written fresh for this
codebase.

## Scheduled jobs

All are optional and degrade to a notice if the extensions are unavailable.

- **Nightly league scoring** (`recompute_league_scores`, 03:15 UTC) needs `pg_cron`.
- **Sunday weekly review** (18:00 UTC) needs `pg_cron` and `pg_net`, plus:
  ```sql
  alter database postgres set app.weekly_review_url = 'https://your-app/api/cron/weekly-review';
  alter database postgres set app.cron_secret = '<same value as CRON_SECRET>';
  ```
  and `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_SECRET_KEY` in the app's env.
  Without `CRON_SECRET` the endpoint refuses to run at all.
- **Workout-day reminder** (hourly) needs `pg_cron` and `pg_net`. Apply
  `20261020000030_workout_reminder_cron.sql` on its own (it is left out of
  `apply-all.sql`, like the weekly review) after:
  ```sql
  alter database postgres set app.workout_reminder_url = 'https://your-app/api/cron/workout-reminder';
  ```
  It reuses `app.cron_secret` / `CRON_SECRET`, and sends only to people who
  turned the reminder on, at the hour they picked, in their own timezone.
