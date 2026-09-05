# Handoff: JLIKA Gym — gym, body & nutrition tracker

## Overview
Private multi-user web app: weekly self-written training programs, live set logging with exercise videos, body photo/measurement progress, fat-loss nutrition with meal plan + grocery list, profile/settings, and a crew league where friends compete on consistency and goal-relative transformation.

## About the design files
`design/JLIKA Gym.dc.html` (+ `design/support.js`) is a **design reference built in HTML** — an interactive prototype showing intended look and behaviour. It is not production code. Recreate it in the target stack (Next.js 15 App Router + Supabase, see `CLAUDE_CODE_PROMPT.md`) using that codebase's patterns.

Open the file in a browser. The left sidebar switches screens. Interactive bits: session set checkboxes + PR badge + rest timer, program "Paste program" panel, photo comparison drag divider, grocery checkboxes, allergy/preference chips, onboarding Back/Continue, profile tabs, league tabs, exercise drawer via any "HOW TO →".

## Fidelity
**High-fidelity.** Colors, type, spacing and copy are final. Imagery is Unsplash placeholder — replace with the user's real photos / exercise media from the DB.

## Screens
Sidebar (216px, `#0b0d0e`, right border `#191d1f`) + top bar (70px) + content (padding 26px 30px). Canvas designed at 1440px.

1. **Today** — grid `1fr 336px`. Hero card 268px (photo, gradient, ghost watermark "UPPER A" 150px/800 lime 7%), 4 stat cards with sparklines, weight trend (12w line chart), week strip (7 cards, states today/done/rest/plan). Right: Fuel ring + macro bars + next meal, progress photo pair + add-photo dashed CTA, muscle-volume bars.
2. **Live session** — grid `1fr 372px`. Stats bar (elapsed / sets done / volume / rest + finish), per-exercise cards with set grid `36px 1fr 1fr 84px 40px` (set, weight, reps, RPE, check). Completed set: field bg `#0f1409`, border `#2c3a14`, lime text; check box fills lime. Sticky right panel: video, cues, history bars, progression hint (lime card).
3. **Exercise drawer** — fixed right 520px, `#0b0d0e`. Video 16:10, 3 stat tiles, 4 numbered steps, start/end stills, "Common mistake" lime card.
4. **Program builder** — grid `1fr 320px`. Header with photo strip + Paste / Copy last week / Publish. 4 day cards (2-col) with drag handle rows and "+ Add exercise". Paste panel (mono textarea, "Parse N lines"). Right: exercise library with filter chips, weekly load check bars.
5. **Body progress** — grid `1fr 348px`. Comparison slider 372px (lime divider + handle), delta tiles ×4, timeline thumbs ×8. Right: measurements table with deltas, strength-vs-bodyweight chart.
6. **Nutrition** — grid `1fr 336px`. Ring 152px + targets + 3 macro tiles; today's meals (56px thumb, slot eyebrow, kcal, macros, check); week plan strip ×7. Right: grocery list grouped by category with checkboxes + EXPORT, allergies panel.
7. **Onboarding** — card + 392px photo panel, 5 steps: Account, Body, Goal, Food, Program. Progress bars on top; Back/Continue; right panel copy changes per step.
8. **Sign in** — card + 452px photo panel; email/password, Google, magic link, 3 value cards.
9. **Profile & settings** — hero header (76px avatar w/ lime ring) + pill tabs: Account, Targets, Food, Crew, Data & privacy. Toggles 40×22 (lime on), segmented controls, sliders with 20px lime knob, danger zone (red border `#4a1c1c`).
10. **Crew league** — hero 300px + grid `1fr 372px`. Standings table `36px 1fr 150px 110px 90px` with 3 tabs (Overall / Consistency / Transformation — re-sorts), cumulative points chart, challenges (crew / head-to-head / personal), challenge nudge, badge grid.

## Design tokens
Colors: bg `#08090a`, sidebar `#0b0d0e`, card `#101214`, field `#0c0e0f`, border `#1d2124`, border-hi `#2c3a14`, selected-bd `#4a6120`, text `#f2f4f2`, text-2 `#98a29c`, muted `#7f8a84`, dim `#5d6763`, faint `#48524e`, accent `#c9f24d` (hover `#dcff77`), accent-soft `#151b0c`, accent-2 `#7d9440`, accent-deep `#3f5320`, warn `#c98d4d`, danger `#e88b8b` on `#2a1010`/`#6a2626`.
Type: Archivo 400–800 for UI; JetBrains Mono 400–800 for numbers, eyebrows (10–10.5px, letter-spacing .1–.14em, uppercase), inputs. Display 34–46px/800/-0.035em; card title 15px/700; body 13–13.5px; captions 11–12px.
Radii: cards 18–20, tiles 12–14, buttons 10–11, fields 9–11, chips 99px. Borders 1px. No shadows.
Spacing: content gap 18px, card padding 20px, grid gaps 10–14px.
Motion: `riseIn` .3s ease on screen change; drawer .22s; streak dot `pulseDot` 2s.

## Interactions & state
See "Screens" and `CLAUDE_CODE_PROMPT.md` (routes, schema, RLS, scoring, phases). Key state: current screen; per-set done map; rest timer countdown; drawer open; paste panel; compare slider %; grocery checked map; allergies/prefs sets; onboarding step; profile tab; league tab; units (kg/lb).

## Assets
All photos are Unsplash hotlinks (placeholders). Icons are geometric (squares/circles/triangles) — use Lucide equivalents in the build. Fonts via Google Fonts.

## Files
- `CLAUDE_CODE_PROMPT.md` — the full build brief (paste into Claude Code first)
- `design/JLIKA Gym.dc.html`, `design/support.js` — interactive reference
- `program/4-Day-Upper-Lower-Program-Photos.pdf` — the user's current week 12 program (seed data)
