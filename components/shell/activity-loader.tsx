"use client";

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BarbellLoader } from "@/components/kit/barbell-loader";
import {
  endNavigation,
  getActivity,
  getServerActivity,
  startNavigation,
  subscribeActivity,
  type Activity,
} from "@/lib/activity";
import { cn } from "@/lib/utils";

/**
 * The app-wide loader: the barbell, centred, whenever a navigation or a
 * reported action is in flight (see lib/activity.ts for what reports).
 *
 * Blocking work also locks the screen, and the lock and the look are separate
 * on purpose:
 * - The lock is immediate. The second tap that does a thing twice lands in
 *   the first few hundred milliseconds, before any loader would show.
 * - The look waits, so a prefetched route or a fast write does not flash a
 *   blur, and once up it stays long enough to read as progress.
 * - Locking means `inert` on the page as well as a layer over it, because a
 *   layer stops a finger but not Enter in a focused field, or Tab.
 * - A lock never traps anyone: after a while, or straight away offline, it
 *   says so and offers a reload or a way back to the screen.
 */
const SHOW_AFTER_MS = 150;
const HOLD_AT_LEAST_MS = 600;
const EXIT_MS = 200;
const STALLED_AFTER_MS = 8_000;

export function ActivityLoader() {
  useLinkTaps();
  useNavigationCommits();
  return (
    <>
      {/* useSearchParams needs a boundary, or every static page bails out of prerendering. */}
      <Suspense fallback={null}>
        <RouteSettled />
      </Suspense>
      <Overlay />
    </>
  );
}

/** A navigation is over once the URL it was heading for is the current one. */
function RouteSettled() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    endNavigation();
  }, [pathname, search]);
  return null;
}

/**
 * Some navigations land where they started, so the URL never changes: on
 * /session/abc, the sidebar's Session link redirects straight back to it.
 * Next writes history once per committed navigation, flagging its own
 * entries with `__NA`, so that write is the signal it landed. Wrapped before
 * Next patches history itself (child effects run first), so Next's internal
 * calls still come through here.
 *
 * Next makes that write from a useInsertionEffect, where React forbids
 * scheduling updates — and ending the navigation updates the loader — so the
 * end waits for the commit to finish.
 */
function useNavigationCommits() {
  useEffect(() => {
    const { pushState, replaceState } = window.history;
    const watch = (original: History["pushState"]): History["pushState"] =>
      function (this: History, data, unused, url) {
        original.call(this, data, unused, url);
        if ((data as { __NA?: boolean } | null)?.__NA) queueMicrotask(endNavigation);
      };
    window.history.pushState = watch(pushState);
    window.history.replaceState = watch(replaceState);
    return () => {
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
    };
  }, []);
}

/**
 * Starts a navigation on any tap of an in-app link, not just the nav's — Today's
 * cards, "Back to Today", a coach's athlete rows. Listens on document so it
 * sees the click after next/link has handled it.
 */
function useLinkTaps() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Route handlers answer with a file, not a page: the URL never changes.
      if (url.pathname.startsWith("/api/")) return;
      // The page already shown, or a jump to an anchor on it.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      startNavigation(url.pathname + url.search);
    }

    // Back from a full page load restores this page as it was left, loader up.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) endNavigation();
    }

    document.addEventListener("click", onClick);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function Overlay() {
  const activity = useSyncExternalStore(subscribeActivity, getActivity, getServerActivity);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const busy = activity !== null;

  // `shown` is what the loader displays. It outlives the work itself by the
  // hold and the exit fade, so it leaves still saying what it did.
  const [shown, setShown] = useState<Activity | null>(null);
  const [visible, setVisible] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownAt = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const reloading = useRef(false);

  const locked = !!activity?.block && !dismissed;

  useEffect(() => {
    if (activity) {
      if (visible) {
        setShown(activity);
        return;
      }
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShown(activity);
        setVisible(true);
      }, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }

    if (!visible) return;
    const timer = setTimeout(
      () => setVisible(false),
      Math.max(0, shownAt.current + HOLD_AT_LEAST_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [activity, visible]);

  useEffect(() => {
    if (visible || !shown) return;
    const timer = setTimeout(() => setShown(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [visible, shown]);

  // Each burst of work starts fresh: its own stall clock, and a lock that an
  // earlier "Hide" does not carry over to.
  useEffect(() => {
    if (!busy) {
      setStalled(false);
      setDismissed(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  // What the person last pressed or typed in: the control that started the
  // work. Read at lock time instead, focus is often already gone — the pressed
  // button disables itself first, and a disabled button drops focus to <body>.
  const intent = useRef<HTMLElement | null>(null);
  useEffect(() => {
    function fromKey() {
      const active = document.activeElement;
      if (root.current?.contains(active)) return;
      intent.current = active instanceof HTMLElement ? active : null;
    }
    function fromPointer(event: PointerEvent) {
      const target = (event.target as Element | null)?.closest?.(
        "button, a[href], input, select, textarea, [tabindex]",
      );
      if (root.current?.contains(target ?? null)) return;
      intent.current = target instanceof HTMLElement ? target : null;
    }
    document.addEventListener("keydown", fromKey, true);
    document.addEventListener("pointerdown", fromPointer, true);
    return () => {
      document.removeEventListener("keydown", fromKey, true);
      document.removeEventListener("pointerdown", fromPointer, true);
    };
  }, []);

  // The page behind is out of reach while locked — to fingers, keys and
  // screen readers alike — and focus goes back where it was afterwards.
  useEffect(() => {
    if (!locked) return;
    const active = document.activeElement;
    const previous =
      active instanceof HTMLElement && active !== document.body ? active : intent.current;
    const made: Element[] = [];
    for (const element of Array.from(document.body.children)) {
      if (element === root.current || element.hasAttribute("inert")) continue;
      // Scripts are inert anyway; the announcer must stay audible, or a
      // navigation is never read out.
      if (/^(SCRIPT|STYLE|TEMPLATE|NEXT-ROUTE-ANNOUNCER)$/.test(element.tagName)) continue;
      element.setAttribute("inert", "");
      made.push(element);
    }
    return () => {
      for (const element of made) element.removeAttribute("inert");
      if (!previous?.isConnected) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      // Refocusing a field on a phone reopens the keyboard over the result.
      const typing = previous.matches("input, textarea, select, [contenteditable]");
      if (typing && window.matchMedia("(pointer: coarse)").matches) return;
      previous.focus({ preventScroll: true });
    };
  }, [locked]);

  // Closing the app mid-save would leave not knowing whether it saved. Only
  // for actions: leaving during a navigation loses nothing.
  const savingBlock = activity?.kind === "action" && activity.block;
  useEffect(() => {
    if (!savingBlock) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (reloading.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [savingBlock]);

  const offline = busy && !online;
  const stuck = busy && (stalled || offline);
  const blur = visible && !!shown?.block && !dismissed;
  const label = shown?.label ?? (shown?.kind === "nav" ? "Loading" : "Working on it");

  function reload() {
    reloading.current = true;
    if (activity?.kind === "nav" && activity.href) window.location.assign(activity.href);
    else window.location.reload();
  }

  return (
    <div
      ref={root}
      data-activity-hud
      className={cn(
        "fixed inset-0 z-[90] flex items-center justify-center px-4",
        locked
          ? "pointer-events-auto cursor-progress touch-none overscroll-contain"
          : "pointer-events-none",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "activity-scrim absolute inset-0 transition-opacity duration-200",
          blur ? "opacity-100" : "opacity-0",
        )}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {shown && !dismissed ? (stuck ? `${label}. ${stuckMessage(offline)}` : label) : ""}
      </p>
      {shown && !dismissed ? (
        <div
          aria-hidden={!stuck || undefined}
          className={cn(
            // No card, just the barbell. The status line above reads the label
            // out; a shadow tinted to the page keeps the bar legible over
            // content when nothing blurs it.
            "relative flex max-w-[300px] flex-col items-center drop-shadow-[0_8px_24px_rgba(8,9,10,0.7)]",
            visible
              ? "animate-in fade-in zoom-in-95 duration-200"
              : "scale-95 opacity-0 transition duration-200",
          )}
        >
          <BarbellLoader width={116} />
          {stuck ? (
            <div className="pointer-events-auto mt-3 flex flex-col items-center text-center">
              <p className="text-[12.5px] leading-[1.45] text-fg-soft">{stuckMessage(offline)}</p>
              <div className="mt-3.5 flex gap-2">
                <button
                  type="button"
                  onClick={reload}
                  className="rounded-[11px] bg-accent px-4 py-2.5 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
                >
                  Reload
                </button>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="rounded-[11px] border border-stroke bg-ghost px-4 py-2.5 text-[13px] font-semibold text-fg-2 hover:bg-hover"
                >
                  Hide
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function stuckMessage(offline: boolean) {
  return offline
    ? "You're offline. Reload once you have a connection."
    : "This is taking longer than usual.";
}
