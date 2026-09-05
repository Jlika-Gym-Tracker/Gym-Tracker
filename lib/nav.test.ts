import { describe, expect, it } from "vitest";
import { isActivePath, titleForPath } from "./nav";

describe("isActivePath", () => {
  it("matches Today only on the exact root", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/program", "/")).toBe(false);
  });

  it("keeps a section active on its sub-routes", () => {
    expect(isActivePath("/session/abc", "/session")).toBe(true);
    expect(isActivePath("/program", "/session")).toBe(false);
  });
});

describe("titleForPath", () => {
  it("falls back to the nearest section for sub-routes", () => {
    expect(titleForPath("/session/abc").title).toBe("Live session");
  });

  it("does not let the root swallow unknown routes", () => {
    expect(titleForPath("/nope").title).toBe("JLIKA Gym");
  });
});
