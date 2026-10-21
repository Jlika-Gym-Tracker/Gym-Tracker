import { describe, expect, it } from "vitest";
import { AI_COACH_ITEM, isActivePath, navGroups, titleForPath } from "@/lib/nav";

describe("the AI Coach nav item", () => {
  it("joins the Train group only when the server has a key", () => {
    const train = (aiCoach: boolean) => navGroups({ aiCoach }).find((g) => g.title === "Train")!.items;
    expect(train(false)).not.toContainEqual(AI_COACH_ITEM);
    expect(train(true).at(-1)).toEqual(AI_COACH_ITEM);
  });

  it("leaves the human coach group to coaching accounts", () => {
    expect(navGroups({ aiCoach: true }).map((g) => g.title)).toEqual(["Train", "Body & fuel"]);
    expect(navGroups({ coaching: true, aiCoach: true }).map((g) => g.title)).toEqual(["Train", "Body & fuel", "Coach"]);
  });

  it("has its own title and active state, separate from the human coach's", () => {
    expect(titleForPath("/ai-coach").title).toBe("AI Coach");
    expect(titleForPath("/coach").title).toBe("Coaching");
    expect(isActivePath("/ai-coach", "/coach")).toBe(false);
  });
});
