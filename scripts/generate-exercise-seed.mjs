import fs from 'node:fs';

/**
 * The exercise library, generated from free-exercise-db (public domain).
 *
 *   node scripts/generate-exercise-seed.mjs [dataset.json]
 *     The curated movements: 20260905000003_seed_exercises.sql and the
 *     matcher's fixture of it.
 *   node scripts/generate-exercise-seed.mjs --full [dataset.json]
 *     Everything else worth logging: 20261020000033_seed_full_library.sql,
 *     inserted with featured = false, and a sample of it for the matcher tests.
 *
 * The dataset defaults to /tmp/fedb.json. It comes off the internet, so the
 * full mode checks every field it reads and quotes every string it writes.
 */
const args = process.argv.slice(2);
const FULL = args.includes('--full');
const SOURCE = args.find((a) => !a.startsWith('--')) ?? '/tmp/fedb.json';
const db = JSON.parse(fs.readFileSync(SOURCE,'utf8'));
if (!Array.isArray(db)) throw new Error(`${SOURCE} is not the free-exercise-db array`);
const byName = new Map(db.map(e => [e.name, e]));
const RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

const EQUIP = { 'bands':'bands','barbell':'barbell','body only':'body_only','cable':'cable',
  'dumbbell':'dumbbell','e-z curl bar':'ez_curl_bar','exercise ball':'exercise_ball',
  'foam roll':'foam_roll','kettlebells':'kettlebells','machine':'machine','medicine ball':'medicine_ball','other':'other' };
const MUSCLE = { 'abdominals':'abdominals','abductors':'abductors','adductors':'adductors','biceps':'biceps',
  'calves':'calves','chest':'chest','forearms':'forearms','glutes':'glutes','hamstrings':'hamstrings',
  'lats':'lats','lower back':'lower_back','middle back':'middle_back','neck':'neck',
  'quadriceps':'quadriceps','shoulders':'shoulders','traps':'traps','triceps':'triceps' };

// [dataset name, aliases the paste parser should also accept]
const PICKS = [
  // --- Upper A -------------------------------------------------------------
  ['Incline Dumbbell Press', ['Incline DB Press']],
  ['Wide-Grip Lat Pulldown', ['Wide Grip Lat Pulldown','Lat Pulldown']],
  ['Leverage Chest Press', ['Machine Chest Press','Chest Press Machine']],
  ['Seated Cable Rows', ['Seated Cable Row','Cable Row']],
  ['Side Lateral Raise', ['Dumbbell Lateral Raise','DB Lateral Raise','Lateral Raise']],
  ['Triceps Pushdown', ['Cable Tricep Pushdown','Tricep Pushdown','Rope Pushdown']],
  ['EZ-Bar Curl', ['EZ Bar Curl','Barbell Curl EZ']],
  // --- Lower A -------------------------------------------------------------
  ['Leg Press', []],
  ['Romanian Deadlift', ['RDL']],
  ['Barbell Walking Lunge', ['Walking Lunges','Walking Lunge']],
  ['Leg Extensions', ['Leg Extension']],
  ['Lying Leg Curls', ['Hamstring Curl','Lying Hamstring Curl','Leg Curl']],
  ['Standing Calf Raises', ['Standing Calf Raise']],
  ['Hanging Leg Raise', ['Hanging Knee Raises','Hanging Knee Raise']],
  // --- Upper B -------------------------------------------------------------
  ['Dumbbell Bench Press', ['Flat Dumbbell Press','Flat DB Press']],
  ['Close-Grip Front Lat Pulldown', ['Close Grip Lat Pulldown']],
  ['Leverage Iso Row', ['Chest Supported Row','Machine Row']],
  ['Machine Shoulder (Military) Press', ['Machine Shoulder Press','Shoulder Press Machine']],
  ['Cable Seated Lateral Raise', ['Cable Lateral Raise']],
  ['Cable Rope Overhead Triceps Extension', ['Overhead Cable Tricep Extension','Overhead Tricep Extension']],
  ['Incline Dumbbell Curl', ['Incline DB Curl']],
  // --- Lower B -------------------------------------------------------------
  ['Hack Squat', ['Machine Hack Squat']],
  ['Seated Leg Curl', ['Seated Hamstring Curl']],
  ['Seated Calf Raise', []],
  ['Cable Crunch', ['Rope Crunch']],
  // --- library staples beyond the program ----------------------------------
  ['Barbell Bench Press - Medium Grip', ['Bench Press','Barbell Bench Press']],
  ['Barbell Squat', ['Back Squat','Squat']],
  ['Barbell Deadlift', ['Deadlift']],
  ['Front Barbell Squat', ['Front Squat']],
  ['Pullups', ['Pull Up','Pull-Ups','Pullup']],
  ['Chin-Up', ['Chin Up','Chinup']],
  ['Dips - Triceps Version', ['Tricep Dips','Dips']],
  ['Pushups', ['Push Up','Push-Ups','Push Ups']],
  ['Bent Over Barbell Row', ['Barbell Row','Bent Over Row']],
  ['One-Arm Dumbbell Row', ['Dumbbell Row','DB Row','Single Arm Row']],
  ['Standing Military Press', ['Overhead Press','Military Press','OHP']],
  ['Arnold Dumbbell Press', ['Arnold Press']],
  ['Dumbbell Shoulder Press', ['DB Shoulder Press','Seated Dumbbell Press']],
  ['Face Pull', ['Cable Face Pull']],
  ['Upright Barbell Row', ['Upright Row']],
  ['Barbell Curl', ['BB Curl']],
  ['Dumbbell Bicep Curl', ['Dumbbell Curl','DB Curl','Bicep Curl']],
  ['Hammer Curls', ['Hammer Curl']],
  ['Preacher Curl', []],
  ['Lying Triceps Press', ['Skullcrusher','Skull Crusher','Lying Tricep Extension']],
  ['Cable Crossover', ['Cable Fly','Cable Flye']],
  ['Dumbbell Flyes', ['Dumbbell Fly','DB Fly']],
  ['Butterfly', ['Pec Deck','Machine Fly','Pec Dec']],
  ['Barbell Incline Bench Press - Medium Grip', ['Incline Bench Press','Incline Barbell Press']],
  ['Decline Barbell Bench Press', ['Decline Bench Press']],
  ['T-Bar Row with Handle', ['T-Bar Row','T Bar Row']],
  ['Rack Pulls', ['Rack Pull']],
  ['Good Morning', ['Good Mornings']],
  ['Barbell Glute Bridge', ['Hip Thrust','Glute Bridge','Glute Bridges']],
  ['Split Squat with Dumbbells', ['Dumbbell Split Squat']],
  ['Dumbbell Lunges', ['Dumbbell Lunge','DB Lunge']],

  ['Standing Leg Curl', []],
  ['Smith Machine Calf Raise', []],
  ['Donkey Calf Raises', ['Donkey Calf Raise']],
  ['Crunches', ['Crunch']],
  ['Plank', ['Front Plank']],
  ['Russian Twist', ['Russian Twists']],
  ['Ab Roller', ['Ab Wheel','Ab Wheel Rollout']],
  ['Wrist Roller', []],
  ["Farmer's Walk", ['Farmers Walk','Farmer Walk']],
  ['Seated Dumbbell Press', ['Seated DB Press']],
  ['Reverse Grip Triceps Pushdown', ['Reverse Grip Pushdown']],
  ['Concentration Curls', ['Concentration Curl']],
  ['Barbell Rear Delt Row', ['Rear Delt Row']],
  ['Reverse Machine Flyes', ['Reverse Pec Deck','Rear Delt Fly']],
];

// Movements the public-domain set has no entry for. Photos stay null rather
// than borrowing a picture of a different exercise.
const EXTRA = [
  { slug:'bulgarian-split-squat', name:'Bulgarian Split Squat',
    primary_muscle:'quadriceps', secondary:['glutes','hamstrings'], equipment:'dumbbell',
    aliases:['Rear Foot Elevated Split Squat','RFESS'],
    how_to:[
      'Stand about a stride length in front of a bench with a dumbbell in each hand.',
      'Place the top of your rear foot on the bench, keeping your front foot flat and pointed forward.',
      'Lower until your front thigh is roughly parallel to the floor and your rear knee is just short of the ground.',
      'Drive through the front heel to stand, keeping your torso tall throughout.',
    ],
    cue:'Keep your weight in the front heel — the back leg only balances.',
    mistake:'Standing too close to the bench, which turns it into a knee-dominant quad crush and lets the front heel lift.' },
];

// Non-featured movements the matcher tests hold the curated ones against:
// every one that scored 0.67 or more against a common name in match.test.ts
// when that list was run over the whole full library.
const MATCH_SAMPLE = new Set([
  '3/4 Sit-Up', 'Alternate Hammer Curl', 'Alternate Incline Dumbbell Curl', 'Axle Deadlift',
  'Ball Leg Curl', 'Band Assisted Pull-Up', 'Band Good Morning', 'Band Skull Crusher',
  'Barbell Hack Squat', 'Barbell Hip Thrust', 'Barbell Lunge', 'Barbell Seated Calf Raise',
  'Barbell Shoulder Press', 'Barbell Shrug', 'Barbell Step Ups', 'Bench Dips',
  'Bench Press - Powerlifting', 'Bench Press - With Bands', 'Bodyweight Squat',
  'Bodyweight Walking Lunge', 'Box Squat', 'Cable Chest Press', 'Cable Deadlifts',
  'Cable Incline Pushdown', 'Cable One Arm Tricep Extension', 'Cable Preacher Curl',
  'Cable Rear Delt Fly', 'Cable Reverse Crunch', 'Cable Russian Twists', 'Cable Seated Crunch',
  'Cable Shoulder Press', 'Cable Shrugs', 'Calf Press On The Leg Press Machine',
  'Calf Raise On A Dumbbell', 'Calf Raises - With Bands', 'Car Deadlift', 'Chair Squat',
  'Clean Deadlift', 'Clean Shrug', 'Clock Push-Up', 'Close-Grip Barbell Bench Press',
  'Close-Grip Dumbbell Press', 'Close-Grip EZ Bar Curl', 'Close-Grip EZ-Bar Curl with Band',
  'Close-Grip EZ-Bar Press', 'Cross Body Hammer Curl', 'Decline Crunch',
  'Decline Dumbbell Bench Press', 'Decline Dumbbell Flyes', 'Decline Push-Up', 'Dip Machine',
  'Dumbbell Alternate Bicep Curl', 'Dumbbell Bench Press with Neutral Grip',
  'Dumbbell Floor Press', 'Dumbbell Incline Row', 'Dumbbell Lying Rear Lateral Raise',
  'Dumbbell One-Arm Shoulder Press', 'Dumbbell Prone Incline Curl', 'Dumbbell Raise',
  'Dumbbell Shrug', 'Dumbbell Step Ups', 'EZ-Bar Skullcrusher', 'Elevated Cable Rows',
  'Flat Bench Cable Flyes', 'Flexor Incline Dumbbell Curls', 'Frog Sit-Ups',
  'Front Barbell Squat To A Bench', 'Front Cable Raise', 'Front Dumbbell Raise',
  'Front Squat (Clean Grip)', 'Front Squats With Two Kettlebells', 'Goblet Squat',
  'Good Morning off Pins', 'Handstand Push-Ups', 'Hanging Bar Good Morning',
  'Incline Dumbbell Flyes', 'Incline Dumbbell Flyes - With A Twist', 'Incline Hammer Curls',
  'Incline Push-Up', 'Jackknife Sit-Up', 'Janda Sit-Up', 'Jogging, Treadmill',
  'Kettlebell Arnold Press', 'Lateral Raise - With Bands', 'Leg-Over Floor Press',
  'Leverage Shoulder Press', 'Leverage Shrug', 'Lunge Sprint', 'Lying Cable Curl',
  'Lying Cambered Barbell Row', 'Lying T-Bar Row', 'Machine Bench Press', 'Machine Bicep Curl',
  'Machine Preacher Curls', 'Narrow Stance Hack Squats', 'Narrow Stance Leg Press',
  'Oblique Crunches', 'One Arm Chin-Up', 'One Arm Dumbbell Bench Press',
  'One Arm Lat Pulldown', 'One-Arm Kettlebell Swings', 'Plyo Push-up',
  'Preacher Hammer Dumbbell Curl', 'Press Sit-Up', 'Rack Pull with Bands',
  'Reverse Band Sumo Deadlift', 'Reverse Barbell Curl', 'Reverse Barbell Preacher Curls',
  'Reverse Crunch', 'Ring Dips', 'Rocking Standing Calf Raise', 'Rocky Pull-Ups/Pulldowns',
  'Romanian Deadlift from Deficit', 'Rope Crunch', 'Scapular Pull-Up',
  'Seated Band Hamstring Curl', 'Seated Barbell Military Press', 'Seated Dumbbell Curl',
  'Seated Good Mornings', 'Seated One-arm Cable Pulley Rows', 'Seated Side Lateral Raise',
  'Shoulder Press - With Bands', 'Side Laterals to Front Raise', 'Single Leg Glute Bridge',
  'Single-Leg Leg Extension', 'Sit-Up', 'Smith Machine Close-Grip Bench Press',
  'Smith Machine Incline Bench Press', 'Smith Machine Leg Press',
  'Smith Machine Overhead Shoulder Press', 'Smith Machine Upright Row', 'Snatch Shrug',
  'Standing Barbell Calf Raise', 'Standing Concentration Curl', 'Standing Dumbbell Calf Raise',
  'Standing Dumbbell Upright Row', 'Step-up with Knee Raise', 'Sumo Deadlift',
  'Sumo Deadlift with Bands', 'Sumo Deadlift with Chains', 'Suspended Split Squat',
  'Upright Cable Row', 'Upright Row - With Bands', 'Weighted Pull Ups',
  'Wide-Grip Pulldown Behind The Neck', 'Zottman Preacher Curl',
]);

const slugify = s => s.toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const q = s => s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g,"''")}'`;
const arr = a => a && a.length ? `array[${a.map(q).join(',')}]::text[]` : `'{}'::text[]`;

const rows = [];
const missing = [];
for (const [name, aliases] of PICKS) {
  const e = byName.get(name);
  if (!e) { missing.push(name); continue; }
  const primary = MUSCLE[(e.primaryMuscles || [])[0]];
  const equipment = EQUIP[e.equipment];
  if (!primary || !equipment) { missing.push(name + ' (unmapped muscle/equipment)'); continue; }
  const secondary = (e.secondaryMuscles || []).map(m => MUSCLE[m]).filter(Boolean);
  const imgs = (e.images || []).map(p => `${RAW}/${p}`);
  rows.push({
    slug: slugify(name), name, primary_muscle: primary, secondary, equipment,
    aliases, image_start_url: imgs[0] ?? null, image_end_url: imgs[1] ?? null,
    how_to: (e.instructions || []).slice(0, 6),
    cues: [], common_mistake: null,
  });
}
for (const x of EXTRA) {
  rows.push({ slug:x.slug, name:x.name, primary_muscle:x.primary_muscle, secondary:x.secondary,
    equipment:x.equipment, aliases:x.aliases, image_start_url:null, image_end_url:null,
    how_to:x.how_to, cues:[x.cue], common_mistake:x.mistake });
}

if (missing.length) { console.error('MISSING:', missing.join(', ')); process.exit(1); }

if (FULL) writeFullLibrary();
else writeCurated();

function writeCurated() {
const values = rows.map(r => `  (${[
  q(r.slug), q(r.name), q(r.primary_muscle), arr(r.secondary), q(r.equipment), arr(r.aliases),
  q(r.image_start_url), q(r.image_end_url), arr(r.how_to), arr(r.cues), q(r.common_mistake),
].join(', ')})`).join(',\n');

const sql = `-- JLIKA Gym — Phase 2 seed: the global exercise library.
--
-- Generated from free-exercise-db (https://github.com/yuhonas/free-exercise-db),
-- which is public domain — the same source the program PDF credits. Photos are
-- hotlinked to raw.githubusercontent.com for now; mirror them into Supabase
-- Storage before this goes anywhere near production traffic.
--
-- owner_id stays null so every account can read these but nobody can edit them.
-- Re-runnable: conflicts on slug refresh the row instead of erroring.

insert into public.exercises
  (slug, name, primary_muscle, secondary_muscles, equipment, aliases,
   image_start_url, image_end_url, how_to, cues, common_mistake)
values
${values}
on conflict (slug) do update set
  name = excluded.name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  aliases = excluded.aliases,
  image_start_url = excluded.image_start_url,
  image_end_url = excluded.image_end_url,
  how_to = excluded.how_to,
  cues = excluded.cues,
  common_mistake = excluded.common_mistake;
`;
fs.writeFileSync('supabase/migrations/20260905000003_seed_exercises.sql', sql);

// A fixture mirroring the seed, so the matcher can be tested against the exact
// library the database will hold. Regenerate alongside the seed.
const fixture = `// GENERATED — mirrors supabase/migrations/20260905000003_seed_exercises.sql.
// Do not edit by hand; regenerate when the seed changes.
import type { LibraryExercise } from "../match";

export const SEEDED_LIBRARY: LibraryExercise[] = ${JSON.stringify(
  rows.map((r, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: r.name, slug: r.slug, aliases: r.aliases,
    primary_muscle: r.primary_muscle, equipment: r.equipment,
    image_start_url: r.image_start_url,
    // Every seeded row is curated, which is what "featured" means.
    featured: true,
  })), null, 2)};
`;
fs.mkdirSync('lib/program/__fixtures__', { recursive: true });
fs.writeFileSync('lib/program/__fixtures__/library.ts', fixture);
console.log('seeded rows:', rows.length);
}

// ------------------------------------------------------------ the full library

/**
 * Every other movement in the dataset, as non-featured rows: browsable and
 * searchable, but kept out of the way of the curated ones. Slugs come from the
 * same slugify as the curated seed, so `on conflict (slug) do nothing` leaves a
 * curated row (and its aliases) exactly as it is.
 */
function writeFullLibrary() {
  // Global rows that already exist: this seed's picks plus the timed and cardio
  // movements 20261020000028 wrote by hand.
  const curated = new Set([
    ...rows.map((r) => r.slug),
    'plank', 'side-bridge', 'running-treadmill', 'walking-treadmill', 'bicycling-stationary',
    'rowing-stationary', 'elliptical-trainer', 'stairmaster', 'rope-jumping',
  ]);

  // Held for time rather than counted: static holds, and the loaded carries
  // and sled work that are timed the way Farmer's Walk already is.
  const TIMED = new Set([
    'Crucifix', 'Isometric Chest Squeezes', 'Isometric Neck Exercise - Front And Back',
    'Isometric Neck Exercise - Sides', 'Plate Pinch',
    'Yoke Walk', 'Rickshaw Carry', 'Sled Drag - Harness', 'Sled Push', 'Backward Drag',
    'Bear Crawl Sled Drags', 'Sled Overhead Backward Walk',
  ]);

  // Untrusted text: no control characters, collapsed whitespace, bounded length.
  const text = (value, max) =>
    typeof value === 'string'
      ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
      : '';
  const list = (value) => (Array.isArray(value) ? value : []);

  const skipped = { curated: 0, stretching: 0, unmappable: [] };
  const seen = new Set();
  const full = [];
  for (const e of db) {
    const name = text(e?.name, 120);
    const slug = slugify(name);
    if (!name || !slug) { skipped.unmappable.push(String(e?.name)); continue; }
    if (curated.has(slug)) { skipped.curated++; continue; }
    if (e.category === 'stretching') { skipped.stretching++; continue; }
    if (seen.has(slug)) { skipped.unmappable.push(`${name} (duplicate slug)`); continue; }

    // A second primary muscle (one entry has two) counts as a secondary one.
    const primary = MUSCLE[list(e.primaryMuscles)[0]];
    const muscles = [...list(e.primaryMuscles), ...list(e.secondaryMuscles)].map((m) => MUSCLE[m]);
    // No equipment listed means bodyweight: lunges, push-ups, sprint drills.
    const equipment = e.equipment == null ? 'body_only' : EQUIP[e.equipment];
    if (!primary || !equipment) { skipped.unmappable.push(name); continue; }

    // Photos live at <folder>/0.jpg and <folder>/1.jpg; anything else gets none.
    const images = list(e.images);
    const folder = typeof images[0] === 'string' ? images[0].split('/')[0] : '';
    const photos =
      images.length === 2 && /^[A-Za-z0-9_-]+$/.test(folder) &&
      images[0] === `${folder}/0.jpg` && images[1] === `${folder}/1.jpg`
        ? folder
        : null;

    seen.add(slug);
    full.push({
      slug, name, primary_muscle: primary,
      secondary: [...new Set(muscles.filter((m) => m && m !== primary))],
      equipment,
      tracking: e.category === 'cardio' ? 'cardio' : TIMED.has(name) ? 'time' : 'reps',
      photos,
      how_to: list(e.instructions).map((s) => text(s, 1000)).filter(Boolean).slice(0, 6),
    });
  }

  const count = (tracking) => full.filter((r) => r.tracking === tracking).length;
  const values = full.map((r) => `  (${[
    q(r.slug), q(r.name), q(r.primary_muscle), q(`{${r.secondary.join(',')}}`), q(r.equipment),
    q(r.tracking), q(r.photos), arr(r.how_to),
  ].join(', ')})`).join(',\n');
  const unmappable = skipped.unmappable.length
    ? `${skipped.unmappable.length} (${skipped.unmappable.join('; ')})`
    : 'none';

  const sql = `-- JLIKA Gym — the rest of the exercise library.
--
-- GENERATED by \`node scripts/generate-exercise-seed.mjs --full\` from
-- free-exercise-db (https://github.com/yuhonas/free-exercise-db), public
-- domain like the curated seed. Do not edit by hand.
--
-- ${full.length} movements, all featured = false: the Exercises page and search
-- reach them, while the builder, the paste matcher and the AI Coach lead with
-- the curated rows. Of the dataset's ${db.length} entries:
--   ${skipped.curated} are curated rows already (0003, 0028) and are left untouched;
--   ${skipped.stretching} are stretches, left out because nothing here logs a stretch;
--   unmappable onto our muscles or equipment: ${unmappable}.
-- Every dataset muscle is one of our 17, and an entry with no equipment is
-- bodyweight. ${count('cardio')} are logged as cardio (the dataset's cardio category)
-- and ${count('time')} as time (static holds, carries and sled work); the rest as reps.
--
-- Photos are hotlinked like the curated seed's, built from each entry's folder
-- to keep this file small. on conflict (slug) do nothing: a curated row, its
-- aliases and anyone's own movement are never overwritten, and re-running is
-- harmless.

insert into public.exercises
  (slug, name, primary_muscle, secondary_muscles, equipment, tracking,
   image_start_url, image_end_url, how_to, featured)
select
  v.slug, v.name, v.primary_muscle, v.secondary_muscles::text[], v.equipment, v.tracking,
  '${RAW}/' || v.photos || '/0.jpg',
  '${RAW}/' || v.photos || '/1.jpg',
  v.how_to, false
from (values
${values}
) as v (slug, name, primary_muscle, secondary_muscles, equipment, tracking, photos, how_to)
on conflict (slug) do nothing;
`;
  fs.writeFileSync('supabase/migrations/20261020000033_seed_full_library.sql', sql);

  // The non-featured rows that compete hardest with the curated names the
  // matcher tests paste, so those tests prove the curated rows still win.
  const sample = full.filter((r) => MATCH_SAMPLE.has(r.name));
  const absent = [...MATCH_SAMPLE].filter((n) => !sample.some((r) => r.name === n));
  if (absent.length) { console.error('MATCH_SAMPLE not in the full library:', absent.join(', ')); process.exit(1); }
  const fixture = `// GENERATED by \`node scripts/generate-exercise-seed.mjs --full\` — a sample of
// supabase/migrations/20261020000033_seed_full_library.sql: the non-featured
// movements whose names sit closest to the curated ones.
import type { LibraryExercise } from "../match";

export const FULL_LIBRARY_SAMPLE: LibraryExercise[] = [
${sample.map((r, i) => `  ${JSON.stringify({
    id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
    name: r.name, slug: r.slug, aliases: [],
    primary_muscle: r.primary_muscle, equipment: r.equipment,
    image_start_url: r.photos ? `${RAW}/${r.photos}/0.jpg` : null,
    tracking: r.tracking,
    featured: false,
  })},`).join('\n')}
];
`;
  fs.writeFileSync('lib/program/__fixtures__/full-library-sample.ts', fixture);
  console.log(`full library: ${full.length} rows (${count('cardio')} cardio, ${count('time')} timed), ` +
    `${skipped.curated} curated, ${skipped.stretching} stretches, ${skipped.unmappable.length} unmappable; ` +
    `sample ${sample.length}; ${Buffer.byteLength(sql)} bytes`);
}
