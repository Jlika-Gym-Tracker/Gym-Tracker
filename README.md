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

The program is always yours — nothing is AI-generated. Four ways to fill a week:

| | |
|---|---|
| **Template** | Pick a split (3-day full body, 4-day upper/lower, 6-day PPL) and equipment; it fills a draft you edit. Fixed blueprints in `lib/program/templates.ts`, not generation — the same choice always gives the same week. |
| **Paste** | Plain text like `1 Incline Dumbbell Press 3 x 8-12`, fuzzy-matched to the library with a review step. |
| **Copy last week** | Duplicates the most recent week as a fresh draft. With *Step loads up* on (the default), each planned load moves up wherever last week cleared its rep range with reps to spare — the same rule the session screen shows as a hint. |
| **Blank** | Build it by hand from the library. |

The beginner template deliberately prescribes less than the load check's weekly
set floor — that floor is tuned for an intermediate lifter in a deficit, and the
UI says so rather than showing an unexplained warning.

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

## Build phases

1. **Foundation** — scaffold, tokens, app shell, Supabase clients, auth, `profiles` + RLS ✅
2. **Program** — weeks/days/exercises, 71-movement seeded library, drag-reorder builder, paste parser with a review step, publish, copy last week ✅
3. **Session logging** — live set rows, rest and elapsed timers, running volume, exercise drawer, progression hints ✅
4. **Body progress** — private photos, comparison slider, measurements, weight and strength trends ✅
5. **Nutrition** — TDEE targets, meal plan, swaps, grocery list, hard allergy filters ✅
6. **Profile, crew & settings** — five tabs, invite codes, sharing controls, export, account deletion ✅
7. **Crew league** — seasons, scoring, standings, challenges, badges, nightly job ✅
8. **Polish** — onboarding, skeletons, keyboard shortcuts, PWA, weekly email, smoke tests ✅

## Scheduled jobs

Both are optional and degrade to a notice if the extensions are unavailable.

- **Nightly league scoring** (`recompute_league_scores`, 03:15 UTC) needs `pg_cron`.
- **Sunday weekly review** (18:00 UTC) needs `pg_cron` and `pg_net`, plus:
  ```sql
  alter database postgres set app.weekly_review_url = 'https://your-app/api/cron/weekly-review';
  alter database postgres set app.cron_secret = '<same value as CRON_SECRET>';
  ```
  and `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_SECRET_KEY` in the app's env.
  Without `CRON_SECRET` the endpoint refuses to run at all.
