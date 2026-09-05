import { describe, expect, it } from "vitest";
import {
  addMacros,
  ageFromBirthDate,
  basalMetabolicRate,
  calculateTargets,
  macrosForGrams,
  type TargetInput,
} from "./targets";

const YASSIR: TargetInput = {
  weightKg: 77.3,
  heightCm: 178,
  age: 30,
  sex: "male",
  activityFactor: 1.45,
  goal: "cut",
};

describe("basalMetabolicRate (Mifflin-St Jeor)", () => {
  it("uses +5 for male and -161 for female", () => {
    const shared = { weightKg: 80, heightCm: 180, age: 30 };
    // 10*80 + 6.25*180 - 5*30 = 1775
    expect(basalMetabolicRate({ ...shared, sex: "male" })).toBeCloseTo(1780, 5);
    expect(basalMetabolicRate({ ...shared, sex: "female" })).toBeCloseTo(1614, 5);
  });

  it("puts 'other' between the two published constants", () => {
    const shared = { weightKg: 80, heightCm: 180, age: 30 };
    const other = basalMetabolicRate({ ...shared, sex: "other" });
    expect(other).toBeLessThan(basalMetabolicRate({ ...shared, sex: "male" }));
    expect(other).toBeGreaterThan(basalMetabolicRate({ ...shared, sex: "female" }));
  });
});

describe("calculateTargets", () => {
  const targets = calculateTargets(YASSIR);

  it("derives maintenance from BMR and the activity factor", () => {
    expect(targets.maintenance).toBe(Math.round(targets.bmr * 1.45));
  });

  it("takes the deficit off maintenance on a cut", () => {
    expect(targets.calories).toBe(targets.maintenance - 400);
  });

  it("adds the surplus on a bulk", () => {
    const bulk = calculateTargets({ ...YASSIR, goal: "bulk" });
    expect(bulk.calories).toBe(bulk.maintenance + 400);
  });

  it("leaves a recomp at maintenance", () => {
    const recomp = calculateTargets({ ...YASSIR, goal: "recomp" });
    expect(recomp.calories).toBe(recomp.maintenance);
  });

  it("sets protein from bodyweight, not from a share of calories", () => {
    expect(targets.proteinG).toBe(Math.round(77.3 * 2.4));
  });

  it("keeps the protein floor when the deficit is aggressive", () => {
    const aggressive = calculateTargets({ ...YASSIR, deficitKcal: 900 });
    expect(aggressive.proteinG).toBe(targets.proteinG);
  });

  it("never prescribes below BMR", () => {
    const extreme = calculateTargets({ ...YASSIR, deficitKcal: 5000 });
    expect(extreme.calories).toBe(extreme.bmr);
  });

  it("makes the macros add back up to the calorie target", () => {
    const fromMacros =
      targets.proteinG * 4 + targets.carbG * 4 + targets.fatG * 9;
    // Rounding each macro to a whole gram moves the total by a few kcal.
    expect(Math.abs(fromMacros - targets.calories)).toBeLessThan(12);
  });

  it("adds the training-day bonus as carbohydrate only", () => {
    expect(targets.trainingDay.calories).toBe(targets.calories + 250);
    expect(targets.trainingDay.proteinG).toBe(targets.proteinG);
    expect(targets.trainingDay.fatG).toBe(targets.fatG);
    // Both fields round to whole grams independently, so the gap is 62 or 63,
    // not exactly 62.5.
    const extraCarbs = targets.trainingDay.carbG - targets.carbG;
    expect(extraCarbs).toBeGreaterThanOrEqual(62);
    expect(extraCarbs).toBeLessThanOrEqual(63);
  });

  it("honours a custom protein and fat split", () => {
    const custom = calculateTargets({ ...YASSIR, proteinGPerKg: 2.2, fatPct: 0.3 });
    expect(custom.proteinG).toBe(Math.round(77.3 * 2.2));
    expect(custom.fatG).toBe(Math.round((custom.calories * 0.3) / 9));
  });
});

describe("ageFromBirthDate", () => {
  it("does not count a birthday that has not happened yet", () => {
    expect(ageFromBirthDate("1996-12-01", new Date("2026-09-05"))).toBe(29);
    expect(ageFromBirthDate("1996-01-01", new Date("2026-09-05"))).toBe(30);
  });

  it("counts the birthday itself", () => {
    expect(ageFromBirthDate("1996-09-05", new Date("2026-09-05"))).toBe(30);
  });
});

describe("macro helpers", () => {
  const chicken = { kcal_per_100g: 165, protein_g: 31, carb_g: 0, fat_g: 3.6 };

  it("scales per-100g values by weight", () => {
    const m = macrosForGrams(chicken, 200);
    expect(m.kcal).toBeCloseTo(330, 5);
    expect(m.proteinG).toBeCloseTo(62, 5);
  });

  it("sums cleanly", () => {
    const total = addMacros(macrosForGrams(chicken, 100), macrosForGrams(chicken, 100));
    expect(total.kcal).toBeCloseTo(330, 5);
  });
});
