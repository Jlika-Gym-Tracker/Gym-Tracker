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
   Project URL and anon key from **Project Settings → API** into `.env.local`.
2. Apply the migrations in `supabase/migrations/` — either paste them into the
   SQL editor in order, or with the CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. **Auth → URL Configuration**: set the Site URL to `http://localhost:3000`
   and add `http://localhost:3000/auth/callback` plus
   `http://localhost:3000/auth/confirm` as redirect URLs.
4. **Auth → Providers**: enable Google if you want the Google button to work.
   Email/password and magic links are on by default.
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

## Conventions

- Server Components fetch data; Client Components only where there is
  interaction (set logging, drag-reorder, photo slider, checkboxes).
- All weights stored in kg, all lengths in cm — convert at the display edge
  from `profiles.unit_system`.
- Anything day-scoped (weigh-ins, photos, plans) is a `date`, never a
  timestamp, to avoid timezone drift.
- No `any`.

## Build phases

1. **Foundation** — scaffold, tokens, app shell, Supabase clients, auth, `profiles` + RLS ✅
2. Program builder, exercise library, paste parser
3. Session logging
4. Body progress
5. Nutrition
6. Profile, crew & settings
7. Crew league
8. Polish
