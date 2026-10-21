import { describe, expect, it } from "vitest";
import { ownExerciseSlug, slugify } from "./own-exercise";

describe("slugify", () => {
  it("keeps letters and digits, joined by dashes", () => {
    expect(slugify("Sissy Squat (Smith)")).toBe("sissy-squat-smith");
    expect(slugify("  Côte-d'Azur  Row ")).toBe("cote-d-azur-row");
  });

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("exercise");
  });
});

describe("ownExerciseSlug", () => {
  const uid = "3f2a9c1e-0000-4000-8000-000000000000";

  it("namespaces by owner so two people never collide", () => {
    expect(ownExerciseSlug(uid, "Sissy Squat")).toBe("u-3f2a9c1e-sissy-squat");
  });

  it("suffixes a repeat", () => {
    expect(ownExerciseSlug(uid, "Sissy Squat", 1)).toBe("u-3f2a9c1e-sissy-squat-2");
  });
});
