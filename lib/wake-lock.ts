"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while a session is open, so a phone does not lock
 * between sets.
 *
 * The browser drops a wake lock by itself whenever the page stops being
 * visible — a glance at a message, the app sent to the background. A one-off
 * request therefore works exactly once and then quietly dies, so the hook keeps
 * its own intent and asks again every time the page comes back into view.
 */
type Sentinel = { release: () => Promise<void>; addEventListener: (type: "release", fn: () => void) => void };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

function api(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock ?? null;
}

export function wakeLockSupported() {
  return api() != null;
}

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    const lock = api();
    if (!enabled || !lock) return;

    let wanted = true;
    let sentinel: Sentinel | null = null;
    let pending = false;

    async function acquire() {
      if (!wanted || sentinel || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const next = await lock!.request("screen");
        if (!wanted) {
          // Released while the request was in flight.
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
        next.addEventListener("release", () => {
          if (sentinel === next) sentinel = null;
        });
      } catch {
        // iOS refuses in Low Power Mode and some browsers on low battery.
        // Nothing the lifter could act on — try again next time we are visible.
        sentinel = null;
      } finally {
        pending = false;
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void acquire();

    return () => {
      wanted = false;
      document.removeEventListener("visibilitychange", onVisibility);
      const held = sentinel;
      sentinel = null;
      if (held) void held.release().catch(() => {});
    };
  }, [enabled]);
}
