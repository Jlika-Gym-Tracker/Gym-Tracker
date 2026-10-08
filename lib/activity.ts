"use client";

import { useEffect } from "react";

/**
 * One app-wide answer to "is something happening?", for the activity loader.
 *
 * Each control already shows its own progress, but that progress is wherever
 * the control is — off screen, under a thumb, or nowhere at all for a tapped
 * link. Launched from the home screen there is no browser chrome either, so
 * no address-bar spinner. Controls report here, and one loader in the root
 * layout shows it.
 *
 * Work comes in two modes:
 * - "block" locks the screen until it lands. For commands (save, finish,
 *   delete, sign in) and navigations: tapping the page being left, or a
 *   second command against data the first is still changing, is how things
 *   get done twice or against the wrong screen.
 * - "soft" only shows the loader. For a switch or chip that changes itself:
 *   the control disables, and freezing the whole screen for it is too much.
 * Quick optimistic writes (ticking a set, a grocery item) report nothing.
 *
 * Actions are tracked individually, so several at once (or two buttons
 * reporting the same form) clear only when the last one does. Navigation is a
 * single slot: a new one replaces the old rather than stacking on it.
 */
export type ActivityMode = "block" | "soft";

export type Activity = {
  kind: "action" | "nav";
  /** True if any of the work in flight locks the screen. */
  block: boolean;
  /** What the newest labelled work says it is doing, e.g. "Saving". */
  label: string | null;
  /** Where a navigation is heading, so a stalled one can be retried. */
  href: string | null;
};

type Entry = { mode: ActivityMode; label: string | null };

const actions = new Set<Entry>();
let navigation: { href: string | null } | null = null;
let navTimeout: ReturnType<typeof setTimeout> | undefined;
let snapshot: Activity | null = null;
const listeners = new Set<() => void>();

// Last resort for a navigation that never lands. The loader offers a way out
// long before this; this only stops a lock outliving every other signal.
const NAV_GIVE_UP_MS = 20_000;

function compute(): Activity | null {
  if (actions.size === 0 && !navigation) return null;
  let block = !!navigation;
  let label: string | null = null;
  for (const entry of actions) {
    if (entry.mode === "block") block = true;
    if (entry.label) label = entry.label;
  }
  return {
    // An action outranks a navigation: its label says more, and an action
    // that redirects is still that action until it lands.
    kind: actions.size > 0 ? "action" : "nav",
    block,
    label,
    href: navigation?.href ?? null,
  };
}

function emit() {
  const next = compute();
  // useSyncExternalStore needs the same object back while nothing changed.
  if (
    next?.kind === snapshot?.kind &&
    next?.block === snapshot?.block &&
    next?.label === snapshot?.label &&
    next?.href === snapshot?.href
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeActivity(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getActivity = () => snapshot;
export const getServerActivity = (): Activity | null => null;

/** Marks an action in flight. Returns its end, which is safe to call twice. */
export function beginAction({
  mode = "block",
  label,
}: { mode?: ActivityMode; label?: string | null } = {}) {
  const entry: Entry = { mode, label: cleanLabel(label) };
  actions.add(entry);
  emit();
  return () => {
    if (actions.delete(entry)) emit();
  };
}

/**
 * Link taps start this on their own (components/shell/activity-loader); call
 * it for navigations that do not come from a link, such as router.replace.
 */
export function startNavigation(href: string | null = null) {
  navigation = { href };
  clearTimeout(navTimeout);
  navTimeout = setTimeout(endNavigation, NAV_GIVE_UP_MS);
  emit();
}

export function endNavigation() {
  clearTimeout(navTimeout);
  if (!navigation) return;
  navigation = null;
  emit();
}

/** Reports an action to the loader for as long as `pending` is true. */
export function useReportActivity(
  pending: boolean,
  { mode = "block", label }: { mode?: ActivityMode; label?: string | null } = {},
) {
  useEffect(() => {
    if (!pending) return;
    return beginAction({ mode, label });
  }, [pending, mode, label]);
}

/** Buttons say "Saving…"; the loader puts the motion in the barbell instead. */
function cleanLabel(label: string | null | undefined) {
  const trimmed = label?.trim().replace(/(…|\.\.\.)$/, "");
  return trimmed ? trimmed : null;
}
