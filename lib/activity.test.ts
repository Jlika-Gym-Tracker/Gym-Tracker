import { afterEach, describe, expect, it, vi } from "vitest";
import { beginAction, endNavigation, getActivity, startNavigation } from "./activity";

/**
 * The app-wide loader reads one value from here. Getting the bookkeeping wrong
 * either unlocks the screen while work is still running, or leaves it locked
 * for good.
 */
describe("activity store", () => {
  afterEach(() => {
    endNavigation();
    vi.useRealTimers();
  });

  it("stays up until the last overlapping action ends", () => {
    const first = beginAction();
    const second = beginAction();
    first();
    expect(getActivity()?.kind).toBe("action");
    second();
    expect(getActivity()).toBeNull();
  });

  it("ignores an action ended twice", () => {
    const first = beginAction();
    const second = beginAction();
    first();
    first();
    expect(getActivity()?.kind).toBe("action");
    second();
    expect(getActivity()).toBeNull();
  });

  it("locks while any blocking work runs, not for soft work alone", () => {
    const soft = beginAction({ mode: "soft" });
    expect(getActivity()?.block).toBe(false);
    const block = beginAction();
    expect(getActivity()?.block).toBe(true);
    block();
    expect(getActivity()?.block).toBe(false);
    soft();
  });

  it("always locks for a navigation", () => {
    startNavigation("/program");
    expect(getActivity()).toMatchObject({ kind: "nav", block: true, href: "/program" });
  });

  it("lets an action outrank a navigation", () => {
    startNavigation();
    const end = beginAction();
    expect(getActivity()?.kind).toBe("action");
    end();
    expect(getActivity()?.kind).toBe("nav");
  });

  it("names the work by its newest label, without the button's ellipsis", () => {
    const unnamed = beginAction();
    expect(getActivity()?.label).toBeNull();
    const saving = beginAction({ label: "Saving…" });
    expect(getActivity()?.label).toBe("Saving");
    const deleting = beginAction({ label: "Deleting..." });
    expect(getActivity()?.label).toBe("Deleting");
    deleting();
    expect(getActivity()?.label).toBe("Saving");
    saving();
    unnamed();
  });

  it("hands back the same object while nothing changed", () => {
    const older = beginAction({ label: "Saving" });
    const newer = beginAction({ label: "Saving" });
    const before = getActivity();
    older();
    expect(getActivity()).toBe(before);
    newer();
  });

  it("gives work that starts later a newer generation, even mid-flight", () => {
    const first = beginAction();
    const older = getActivity()!.generation;
    const second = beginAction({ mode: "soft" });
    expect(getActivity()!.generation).toBeGreaterThan(older);
    second();
    expect(getActivity()?.generation).toBe(older);
    first();
  });

  it("gives a navigation a generation of its own", () => {
    const end = beginAction();
    const action = getActivity()!.generation;
    startNavigation("/program");
    expect(getActivity()!.generation).toBeGreaterThan(action);
    endNavigation();
    expect(getActivity()?.generation).toBe(action);
    end();
  });

  it("gives up on a navigation that never lands", () => {
    vi.useFakeTimers();
    startNavigation();
    vi.advanceTimersByTime(19_999);
    expect(getActivity()?.kind).toBe("nav");
    vi.advanceTimersByTime(1);
    expect(getActivity()).toBeNull();
  });
});
