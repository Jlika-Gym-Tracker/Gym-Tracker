import { describe, expect, it } from "vitest";
import { composeWeeklyReview, type WeeklyReview } from "./weekly-review";

const base: WeeklyReview = {
  displayName: "Yassir",
  sessionsDone: 4,
  sessionsPlanned: 4,
  setsCompleted: 84,
  volumeKg: 42300,
  weightChangeKg: -0.6,
  nextWeekPublished: true,
};

describe("composeWeeklyReview", () => {
  it("celebrates a complete week without overstating it", () => {
    const email = composeWeeklyReview(base);
    expect(email.text).toContain("Every planned session done");
    expect(email.subject).toContain("4 sessions");
  });

  it("is honest when nothing was logged", () => {
    const email = composeWeeklyReview({ ...base, sessionsDone: 0, volumeKg: 0, setsCompleted: 0 });
    expect(email.text).toContain("logged none");
    expect(email.text).not.toMatch(/great|amazing|crushed/i);
  });

  it("does not pretend a week existed when none was written", () => {
    const email = composeWeeklyReview({
      ...base, sessionsDone: 0, sessionsPlanned: 0, setsCompleted: 0, volumeKg: 0,
    });
    expect(email.text).toContain("No week was written");
  });

  it("says so when there were no weigh-ins", () => {
    const email = composeWeeklyReview({ ...base, weightChangeKg: null });
    expect(email.text).toContain("No weigh-ins this week");
  });

  it("reports the direction of a weight change", () => {
    expect(composeWeeklyReview({ ...base, weightChangeKg: -0.6 }).text).toContain("down 0.6 kg");
    expect(composeWeeklyReview({ ...base, weightChangeKg: 0.4 }).text).toContain("up 0.4 kg");
  });

  it("nudges when next week is unwritten", () => {
    const email = composeWeeklyReview({ ...base, nextWeekPublished: false });
    expect(email.text).toContain("not written yet");
  });

  it("escapes HTML so a display name cannot inject markup", () => {
    const email = composeWeeklyReview({ ...base, displayName: '<img src=x onerror="alert(1)">' });
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });
});
