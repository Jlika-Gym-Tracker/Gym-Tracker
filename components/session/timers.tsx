"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatDuration } from "@/lib/units";
import { cn } from "@/lib/utils";
import { chime, primeAudio } from "@/lib/sound";
import { cancelRestAlert, scheduleRestAlert } from "@/lib/push/rest-alert";

/** Counts up from when the session started. Server time, client tick. */
export function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setSeconds((Date.now() - start) / 1000);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <span suppressHydrationWarning className="font-mono text-2xl font-extrabold tracking-[-0.02em]">
      {formatDuration(seconds)}
    </span>
  );
}

/** Re-renders four times a second while `active`, for clocks that read Date.now(). */
export function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [active]);
}

const ADJUST_SECONDS = 15;

export type RestTimerState = ReturnType<typeof useRestTimer>;

/**
 * Owns the rest countdown so the bar, the set rows and the keyboard can all
 * drive it. The end time is the source of truth, not a decrementing counter,
 * so a throttled background tab still lands on the right second.
 */
export function useRestTimer(defaultSeconds: number, { sound = true }: { sound?: boolean } = {}) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(defaultSeconds);
  const chimed = useRef(false);
  const running = endsAt != null;
  useTicker(running);

  const remaining = endsAt == null ? defaultSeconds : Math.ceil((endsAt - Date.now()) / 1000);

  useEffect(() => {
    if (endsAt == null || chimed.current || remaining > 0) return;
    chimed.current = true;
    if (sound) chime();
  }, [endsAt, remaining, sound]);

  // Leaving the session screen (finishing, discarding, navigating away) must
  // not leave an alert queued for a rest nobody is taking.
  useEffect(() => () => cancelRestAlert(), []);

  function begin(seconds: number) {
    const end = Date.now() + seconds * 1000;
    chimed.current = false;
    setTotal(seconds);
    setEndsAt(end);
    scheduleRestAlert(end);
  }

  function start() {
    primeAudio();
    begin(defaultSeconds);
  }

  function skip() {
    setEndsAt(null);
    setTotal(defaultSeconds);
    cancelRestAlert();
  }

  /** ±15 s. Taking off more than is left finishes the rest, like Skip does. */
  function adjust(delta: number) {
    if (endsAt == null) return;
    const left = (endsAt - Date.now()) / 1000;
    if (left + delta <= 0) {
      skip();
      return;
    }
    const end = endsAt + delta * 1000;
    if (end > Date.now()) chimed.current = false;
    setEndsAt(end);
    setTotal((t) => Math.max(1, t + delta));
    scheduleRestAlert(end);
  }

  function toggle() {
    if (running) skip();
    else start();
  }

  return { running, remaining, total, start, skip, adjust, toggle };
}

/**
 * The rest control. Idle it is one button that starts a rest; running it fills
 * as time passes, with −15 and +15 either side and a tap on the clock to skip.
 * −15 and +15 sit together in number-line order and Skip is the clock itself,
 * so the button that ends the rest is never the one you reach for to buy time.
 */
export function RestTimer({
  rest,
  seconds,
  className,
}: {
  rest: RestTimerState;
  seconds: number;
  className?: string;
}) {
  const done = rest.running && rest.remaining <= 0;
  const pct = rest.running ? Math.min(100, Math.max(0, (1 - rest.remaining / rest.total) * 100)) : 0;
  const nudge =
    "flex size-11 flex-none items-center justify-center rounded-[11px] border border-stroke bg-ghost font-mono text-[11px] font-bold text-fg-2 transition-colors hover:bg-hover lg:size-auto lg:px-2.5 lg:py-3";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {rest.running && !done ? (
        <button
          type="button"
          onClick={() => rest.adjust(-ADJUST_SECONDS)}
          aria-label="Take 15 seconds off the rest"
          className={nudge}
        >
          <Minus className="size-3 lg:hidden" strokeWidth={2.5} />
          <span className="hidden lg:inline">−15</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={rest.toggle}
        aria-label={rest.running ? "Skip the rest" : `Start a ${seconds} second rest`}
        className={cn(
          "relative min-w-0 flex-1 overflow-hidden rounded-[11px] border px-[18px] py-3 font-mono text-[13px] font-bold transition-colors",
          done
            ? "border-accent bg-accent text-[#0a0c0d]"
            : rest.running
              ? "border-line-hi bg-accent-soft text-accent"
              : "border-stroke bg-ghost text-fg-2 hover:bg-hover",
        )}
      >
        {rest.running && !done ? (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-accent/15 transition-[width] duration-300 ease-linear"
            style={{ width: `${pct}%` }}
          />
        ) : null}
        <span className="relative whitespace-nowrap">
          {rest.running
            ? done
              ? "REST DONE"
              : `REST ${formatDuration(rest.remaining)}`
            : `REST ${seconds}s`}
        </span>
      </button>
      {rest.running && !done ? (
        <button
          type="button"
          onClick={() => rest.adjust(ADJUST_SECONDS)}
          aria-label="Add 15 seconds to the rest"
          className={nudge}
        >
          <Plus className="size-3 lg:hidden" strokeWidth={2.5} />
          <span className="hidden lg:inline">+15</span>
        </button>
      ) : null}
    </div>
  );
}
