import { describe, expect, it } from "vitest";
import { MUSCLES } from "@/lib/training/muscle-load";
import { BODY_PATHS } from "./body-paths";

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/;

describe("body artwork", () => {
  for (const figure of ["male", "female"] as const) {
    it(`draws every muscle somewhere on the ${figure} figure`, () => {
      const drawn = new Set(
        (["front", "back"] as const).flatMap((side) =>
          BODY_PATHS[figure][side].regions.map(([muscle]) => muscle),
        ),
      );
      expect(MUSCLES.filter((m) => !drawn.has(m))).toEqual([]);
    });

    it(`holds only path data for the ${figure} figure`, () => {
      for (const side of ["front", "back"] as const) {
        const view = BODY_PATHS[figure][side];
        expect(view.viewBox.split(" ")).toHaveLength(4);
        const all = [...view.silhouette, ...view.hair, ...view.regions.flatMap(([, d]) => d)];
        expect(all.length).toBeGreaterThan(0);
        for (const d of all) expect(d).toMatch(PATH_DATA);
      }
    });
  }

  it("paints overlays after the regions they sit on", () => {
    const order = BODY_PATHS.male.back.regions.map(([m]) => m);
    expect(order.indexOf("middle_back")).toBeGreaterThan(order.indexOf("traps"));
    expect(order.indexOf("adductors")).toBeGreaterThan(order.indexOf("hamstrings"));
    const front = BODY_PATHS.male.front.regions.map(([m]) => m);
    expect(front.indexOf("abductors")).toBeGreaterThan(front.indexOf("quadriceps"));
  });
});
