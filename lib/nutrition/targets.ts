/**
 * Calorie and macro targets.
 *
 * Mifflin-St Jeor for BMR, an activity factor for maintenance, a deficit or
 * surplus for the goal, then protein and fat set as floors with carbohydrate
 * taking whatever is left. Pure functions, unit-tested.
 */

export type Sex = "male" | "female" | "other";
export type Goal = "cut" | "bulk" | "recomp" | "strength" | "health";

export type TargetInput = {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activityFactor: number;
  goal: Goal;
  /** Positive number of kcal to remove on a cut / add on a bulk. */
  deficitKcal?: number;
  proteinGPerKg?: number;
  fatPct?: number;
  trainingDayBonusKcal?: number;
};

export type Targets = {
  bmr: number;
  maintenance: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  /** Same day, plus the training-day bonus, taken entirely as carbohydrate. */
  trainingDay: { calories: number; proteinG: number; fatG: number; carbG: number };
};

/** Mifflin-St Jeor. "Other" sits midway between the two published constants. */
export function basalMetabolicRate({
  weightKg,
  heightCm,
  age,
  sex,
}: Pick<TargetInput, "weightKg" | "heightCm" | "age" | "sex">): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const offset = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return base + offset;
}

const round = (n: number) => Math.round(n);

export function calculateTargets(input: TargetInput): Targets {
  const {
    weightKg,
    activityFactor,
    goal,
    deficitKcal = 400,
    proteinGPerKg = 2.4,
    fatPct = 0.28,
    trainingDayBonusKcal = 250,
  } = input;

  const bmr = basalMetabolicRate(input);
  const maintenance = bmr * activityFactor;

  const adjustment =
    goal === "cut" ? -Math.abs(deficitKcal)
    : goal === "bulk" ? Math.abs(deficitKcal)
    : 0;

  // Never prescribe below BMR — that is where a cut stops being a diet.
  const calories = Math.max(bmr, maintenance + adjustment);

  // Protein is a floor set by bodyweight, not a share of calories.
  const proteinG = weightKg * proteinGPerKg;
  const fatG = (calories * fatPct) / 9;
  const carbKcal = calories - proteinG * 4 - fatG * 9;
  const carbG = Math.max(0, carbKcal / 4);

  const trainingCalories = calories + trainingDayBonusKcal;

  return {
    bmr: round(bmr),
    maintenance: round(maintenance),
    calories: round(calories),
    proteinG: round(proteinG),
    fatG: round(fatG),
    carbG: round(carbG),
    trainingDay: {
      calories: round(trainingCalories),
      proteinG: round(proteinG),
      fatG: round(fatG),
      // The bonus is carbohydrate, to fuel the session rather than pad fat.
      carbG: round(carbG + trainingDayBonusKcal / 4),
    },
  };
}

export function ageFromBirthDate(birthDate: string, today = new Date()): number {
  const born = new Date(birthDate);
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age--;
  return Math.max(0, age);
}

export const ACTIVITY_LEVELS = [
  { factor: 1.35, name: "Desk", detail: "Sitting most of the day" },
  { factor: 1.45, name: "Light", detail: "Some walking, light chores" },
  { factor: 1.55, name: "Active", detail: "On your feet regularly" },
  { factor: 1.7, name: "On feet", detail: "Physical job, lots of steps" },
] as const;

/** Macro totals for a set of foods, for the ring and the meal rows. */
export type MacroTotals = { kcal: number; proteinG: number; carbG: number; fatG: number };

export function emptyMacros(): MacroTotals {
  return { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
}

export function addMacros(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbG: a.carbG + b.carbG,
    fatG: a.fatG + b.fatG,
  };
}

/** Macros for `grams` of a per-100g ingredient. */
export function macrosForGrams(
  per100g: { kcal_per_100g: number; protein_g: number; carb_g: number; fat_g: number },
  grams: number,
): MacroTotals {
  const factor = grams / 100;
  return {
    kcal: Number(per100g.kcal_per_100g) * factor,
    proteinG: Number(per100g.protein_g) * factor,
    carbG: Number(per100g.carb_g) * factor,
    fatG: Number(per100g.fat_g) * factor,
  };
}
