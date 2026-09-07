import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_PROFILES,
  TEMPLATES,
  findTemplate,
  resolveTemplate,
  type EquipmentProfile,
} from "./templates";
import { SEEDED_LIBRARY } from "./__fixtures__/library";
import { weeklyLoad } from "./volume";
import type { DayWithExercises } from "./queries";

/** Shapes a resolved template like the rows weeklyLoad expects. */
function asLoadInput(
  days: ReturnType<typeof resolveTemplate>["days"],
): DayWithExercises[] {
  const byId = new Map(SEEDED_LIBRARY.map((e) => [e.id, e]));
  return days.map((day) => ({
    id: String(day.dayIndex),
    day_index: day.dayIndex,
    name: day.name,
    focus_note: day.focusNote,
    is_rest: false,
    exercises: day.exercises.map((e, position) => ({
      id: `${day.dayIndex}-${position}`,
      position,
      target_sets: e.targetSets,
      rep_min: e.repMin,
      rep_max: e.repMax,
      per_side: e.perSide,
      note: null,
      target_weight_kg: null,
      exercise: {
        id: e.exerciseId,
        name: e.name,
        slug: byId.get(e.exerciseId)!.slug,
        primary_muscle: byId.get(e.exerciseId)!.primary_muscle as never,
        equipment: byId.get(e.exerciseId)!.equipment as never,
        image_start_url: null,
      },
    })),
  }));
}

describe("template catalogue", () => {
  it("offers a beginner option, and it is the smallest commitment", () => {
    const beginner = TEMPLATES.filter((t) => t.level === "beginner");
    expect(beginner.length).toBeGreaterThan(0);
    const fewestDays = Math.min(...TEMPLATES.map((t) => t.daysPerWeek));
    expect(beginner[0]!.daysPerWeek).toBe(fewestDays);
  });

  it("has unique slugs and matching day counts", () => {
    const slugs = TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const template of TEMPLATES) {
      expect(template.days).toHaveLength(template.daysPerWeek);
    }
  });

  it("never puts two days on the same weekday", () => {
    for (const template of TEMPLATES) {
      const indexes = template.days.map((d) => d.dayIndex);
      expect(new Set(indexes).size).toBe(indexes.length);
      for (const index of indexes) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(6);
      }
    }
  });

  it("only references exercises that exist in the seeded library", () => {
    const slugs = new Set(SEEDED_LIBRARY.map((e) => e.slug));
    const missing: string[] = [];
    for (const template of TEMPLATES) {
      for (const day of template.days) {
        for (const slot of day.slots) {
          for (const candidate of slot.candidates) {
            if (!slugs.has(candidate)) missing.push(`${template.slug}/${slot.label}/${candidate}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("prescribes sensible sets and rep ranges", () => {
    for (const template of TEMPLATES) {
      for (const day of template.days) {
        for (const slot of day.slots) {
          expect(slot.sets).toBeGreaterThanOrEqual(1);
          expect(slot.sets).toBeLessThanOrEqual(6);
          expect(slot.repMin).toBeGreaterThan(0);
          if (slot.repMax != null) expect(slot.repMax).toBeGreaterThanOrEqual(slot.repMin);
        }
      }
    }
  });

  it("finds a template by slug and nothing by a bad one", () => {
    expect(findTemplate("upper-lower-4")?.name).toBe("4-day upper / lower");
    expect(findTemplate("nope")).toBeUndefined();
  });
});

describe("resolveTemplate in a full gym", () => {
  for (const template of TEMPLATES) {
    it(`${template.slug} fills every slot`, () => {
      const resolved = resolveTemplate(template, SEEDED_LIBRARY, "full_gym");
      expect(resolved.unfilled).toEqual([]);
    });

    it(`${template.slug} never repeats an exercise within a day`, () => {
      const resolved = resolveTemplate(template, SEEDED_LIBRARY, "full_gym");
      for (const day of resolved.days) {
        const ids = day.exercises.map((e) => e.exerciseId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it(`${template.slug} is deterministic`, () => {
      const a = resolveTemplate(template, SEEDED_LIBRARY, "full_gym");
      const b = resolveTemplate(template, SEEDED_LIBRARY, "full_gym");
      expect(a).toEqual(b);
    });
  }

  // A template should not hand someone a week its own load check immediately
  // flags — unless it says it is doing that on purpose.
  for (const template of TEMPLATES.filter((t) => !t.belowFloorByDesign)) {
    it(`${template.slug} clears every weekly set floor`, () => {
      const resolved = resolveTemplate(template, SEEDED_LIBRARY, "full_gym");
      const under = weeklyLoad(asLoadInput(resolved.days))
        .filter((l) => l.status === "under")
        .map((l) => `${l.label} ${l.sets}/${l.floor}`);
      expect(under).toEqual([]);
    });
  }

  it("marks the beginner template as deliberately below the floor", () => {
    const beginner = TEMPLATES.find((t) => t.level === "beginner")!;
    expect(beginner.belowFloorByDesign).toBe(true);
    // And it really is below it — otherwise the flag is a lie.
    const resolved = resolveTemplate(beginner, SEEDED_LIBRARY, "full_gym");
    const under = weeklyLoad(asLoadInput(resolved.days)).filter((l) => l.status === "under");
    expect(under.length).toBeGreaterThan(0);
  });
});

describe("resolveTemplate with limited equipment", () => {
  const profiles: EquipmentProfile[] = ["dumbbells", "bodyweight"];

  for (const equipment of profiles) {
    it(`${equipment}: only picks exercises that equipment allows`, () => {
      const allowed = new Set(
        EQUIPMENT_PROFILES.find((p) => p.key === equipment)!.allows,
      );
      const byId = new Map(SEEDED_LIBRARY.map((e) => [e.id, e]));
      for (const template of TEMPLATES) {
        const resolved = resolveTemplate(template, SEEDED_LIBRARY, equipment);
        for (const day of resolved.days) {
          for (const exercise of day.exercises) {
            expect(allowed.has(byId.get(exercise.exerciseId)!.equipment)).toBe(true);
          }
        }
      }
    });

    it(`${equipment}: still produces a usable week`, () => {
      const resolved = resolveTemplate(findTemplate("full-body-3")!, SEEDED_LIBRARY, equipment);
      const total = resolved.days.reduce((n, d) => n + d.exercises.length, 0);
      expect(total).toBeGreaterThan(4);
    });
  }

  it("reports what it could not fill rather than dropping it silently", () => {
    const resolved = resolveTemplate(findTemplate("full-body-3")!, SEEDED_LIBRARY, "bodyweight");
    // Nothing in a public-domain bodyweight library covers a loaded hinge.
    expect(resolved.unfilled.length).toBeGreaterThan(0);
    expect(resolved.unfilled.every((u) => u.includes(": "))).toBe(true);
    const listed = resolved.days.flatMap((d) => d.unfilled);
    expect(listed.length).toBe(resolved.unfilled.length);
  });

  it("returns nothing at all rather than junk when the library is empty", () => {
    const resolved = resolveTemplate(findTemplate("full-body-3")!, [], "full_gym");
    expect(resolved.days.every((d) => d.exercises.length === 0)).toBe(true);
    expect(resolved.unfilled.length).toBeGreaterThan(0);
  });
});
