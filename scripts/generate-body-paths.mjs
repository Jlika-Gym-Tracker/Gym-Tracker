/**
 * Converts MuscleMap's body artwork into lib/muscles/body-paths.ts.
 *
 * MuscleMap (https://github.com/melihcolpan/MuscleMap, MIT, © Melih Colpan)
 * ships its SVG path data as Swift source rather than .svg files, so this reads
 * the four Data/*Paths.swift files and the view boxes in BodyPathData.swift,
 * and writes them out keyed by this app's muscle names. See
 * THIRD_PARTY_NOTICES.md.
 *
 *   git clone --depth 1 https://github.com/melihcolpan/MuscleMap.git /tmp/MuscleMap
 *   node scripts/generate-body-paths.mjs /tmp/MuscleMap
 *
 * The Swift files are treated as data, never run: only `slug: .name` and
 * quoted strings are read out of them, and every string must look like SVG
 * path data or the script stops.
 */
import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
const out = process.argv[3] ?? "lib/muscles/body-paths.ts";
if (!source) {
  console.error("usage: node scripts/generate-body-paths.mjs <MuscleMap checkout> [out]");
  process.exit(1);
}
const dataDir = path.join(source, "Sources/MuscleMap/Data");

/**
 * MuscleMap slug → this app's muscle.
 *
 * Its "upper back" is the latissimus, so it is our lats. Our middle back
 * (rhomboids, mid traps, the muscles over the shoulder blade) takes both its
 * rhomboid overlay and its rotator-cuff region. It has no abductor artwork;
 * the closest region is its hip-flexor patch on the outer front of the hip,
 * which is where the tensor fasciae latae sits — an abductor in its own
 * right — so abductors are drawn there.
 */
const MUSCLE = {
  chest: "chest",
  upperBack: "lats",
  rhomboids: "middle_back",
  rotatorCuff: "middle_back",
  lowerBack: "lower_back",
  trapezius: "traps",
  deltoids: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearm: "forearms",
  quadriceps: "quadriceps",
  hamstring: "hamstrings",
  gluteal: "glutes",
  calves: "calves",
  abs: "abdominals",
  obliques: "abdominals",
  hipFlexors: "abductors",
  adductors: "adductors",
  neck: "neck",
};

/** Body parts that carry no training load: drawn as the plain silhouette. */
const SILHOUETTE = new Set(["head", "hands", "feet", "knees", "ankles", "tibialis"]);
const HAIR = new Set(["hair"]);

/**
 * Sub-groups MuscleMap cuts out of a parent muscle's artwork (upper chest,
 * outer quad …). The data here resolves to whole muscles, so the parent is
 * drawn and these are dropped — shading half a pec would claim a precision
 * the exercise library does not have.
 */
const DROPPED = new Set([
  "upperChest", "lowerChest", "innerQuad", "outerQuad", "upperAbs", "lowerAbs",
  "frontDeltoid", "rearDeltoid", "upperTrapezius", "lowerTrapezius", "serratus",
]);

/**
 * Paint order. A few regions sit on top of another's artwork — the rhomboids
 * over the trapezius, the adductors over the hamstrings on the back view, the
 * hip patch over the quads — so those go last or they would be painted over.
 */
const DRAW_ORDER = [
  "chest", "lats", "lower_back", "traps", "shoulders", "biceps", "triceps",
  "forearms", "abdominals", "quadriceps", "hamstrings", "glutes", "calves",
  "neck", "adductors", "middle_back", "abductors",
];

const VIEWS = [
  { figure: "male", side: "front", file: "MaleFrontPaths.swift", box: "maleFront" },
  { figure: "male", side: "back", file: "MaleBackPaths.swift", box: "maleBack" },
  { figure: "female", side: "front", file: "FemaleFrontPaths.swift", box: "femaleFront" },
  { figure: "female", side: "back", file: "FemaleBackPaths.swift", box: "femaleBack" },
];

// Commands, digits, signs, separators. No exponents: the whitespace squeeze
// below relies on letters only ever being commands.
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/;

function viewBoxes() {
  const text = fs.readFileSync(path.join(dataDir, "BodyPathData.swift"), "utf8");
  const boxes = {};
  const re =
    /static let (\w+) = BodyViewBox\(\s*origin: CGPoint\(x: ([\d.]+), y: ([\d.]+)\),\s*size: CGSize\(width: ([\d.]+), height: ([\d.]+)\)/g;
  for (const m of text.matchAll(re)) boxes[m[1]] = [m[2], m[3], m[4], m[5]].join(" ");
  return boxes;
}

/** Spaces next to a command letter, and separators before a minus, carry nothing. */
function squeeze(d) {
  return d
    .trim()
    .replace(/\s*([A-Za-z])\s*/g, "$1")
    .replace(/[\s,]+-/g, "-")
    .replace(/\s+/g, " ");
}

function parts(file) {
  const text = fs.readFileSync(path.join(dataDir, file), "utf8");
  const blocks = text.split("BodyPartPathData(").slice(1);
  return blocks.map((block) => {
    const slug = block.match(/slug:\s*\.(\w+)/)?.[1];
    if (!slug) throw new Error(`${file}: a body part with no slug`);
    // Up to the closing paren of this part, so anything after the last part
    // (a trailing helper, a doc string) stays out.
    const end = block.indexOf("\n        )");
    const body = end === -1 ? block : block.slice(0, end);
    const paths = [...body.matchAll(/"([^"\\]*)"/g)].map((m) => m[1]);
    for (const d of paths) {
      if (!PATH_DATA.test(d)) throw new Error(`${file}/${slug}: not SVG path data`);
    }
    return { slug, paths: paths.map(squeeze) };
  });
}

const boxes = viewBoxes();
const result = { male: {}, female: {} };

for (const view of VIEWS) {
  const viewBox = boxes[view.box];
  if (!viewBox) throw new Error(`no view box for ${view.box}`);
  const silhouette = [];
  const hair = [];
  const regions = new Map();

  for (const part of parts(view.file)) {
    if (DROPPED.has(part.slug)) continue;
    if (SILHOUETTE.has(part.slug)) silhouette.push(...part.paths);
    else if (HAIR.has(part.slug)) hair.push(...part.paths);
    else if (MUSCLE[part.slug]) {
      const muscle = MUSCLE[part.slug];
      regions.set(muscle, [...(regions.get(muscle) ?? []), ...part.paths]);
    } else {
      throw new Error(`${view.file}: unmapped slug .${part.slug}`);
    }
  }

  result[view.figure][view.side] = {
    viewBox,
    silhouette,
    hair,
    regions: DRAW_ORDER.filter((m) => regions.has(m)).map((m) => [m, regions.get(m)]),
  };
}

// Every one of the app's muscles has to land somewhere on every figure.
for (const figure of ["male", "female"]) {
  const drawn = new Set(
    ["front", "back"].flatMap((side) => result[figure][side].regions.map(([m]) => m)),
  );
  const missing = DRAW_ORDER.filter((m) => !drawn.has(m));
  if (missing.length) throw new Error(`${figure}: nothing drawn for ${missing.join(", ")}`);
}

const header = `/**
 * Body artwork for the muscle map: front and back, male and female.
 *
 * Generated by scripts/generate-body-paths.mjs from MuscleMap by Melih Colpan
 * (MIT) — see THIRD_PARTY_NOTICES.md. Do not edit by hand; re-run the script.
 *
 * \`regions\` is in paint order: a region that overlaps another's artwork comes
 * after it. \`silhouette\` is the head, hands, knees and feet, which carry no
 * training load and are never shaded.
 */
import type { BodyFigure, Muscle } from "@/lib/database.types";

export type BodySide = "front" | "back";

export type BodyView = {
  viewBox: string;
  silhouette: readonly string[];
  hair: readonly string[];
  regions: readonly (readonly [Muscle, readonly string[]])[];
};

export const BODY_PATHS: Record<BodyFigure, Record<BodySide, BodyView>> = `;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${header}${JSON.stringify(result)};\n`);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
