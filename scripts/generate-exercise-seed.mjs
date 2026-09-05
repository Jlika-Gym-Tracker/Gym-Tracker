import fs from 'node:fs';
const db = JSON.parse(fs.readFileSync('/tmp/fedb.json','utf8'));
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
  })), null, 2)};
`;
fs.mkdirSync('lib/program/__fixtures__', { recursive: true });
fs.writeFileSync('lib/program/__fixtures__/library.ts', fixture);
console.log('seeded rows:', rows.length);
