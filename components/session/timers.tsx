"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/units";
import { cn } from "@/lib/utils";

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

export type RestTimerHandle = { start: () => void };

/**
 * Rest countdown. Starts when a set is ticked off and can be tapped to
 * start/stop by hand. Fires a short beep at zero if the tab is allowed to.
 */
export function RestTimer({
  seconds,
  running,
  remaining,
  onToggle,
  className,
}: {
  seconds: number;
  running: boolean;
  remaining: number;
  onToggle: () => void;
  className?: string;
}) {
  const done = running && remaining <= 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "rounded-[11px] border px-[18px] py-3 font-mono text-[13px] font-bold transition-colors",
        className,
        done
          ? "border-accent bg-accent text-[#0a0c0d]"
          : running
            ? "border-line-hi bg-accent-soft text-accent"
            : "border-stroke bg-ghost text-fg-2 hover:bg-hover",
      )}
    >
      {running ? (done ? "REST DONE" : `REST ${formatDuration(remaining)}`) : `REST ${seconds}s`}
    </button>
  );
}

/** Owns the rest countdown so both the bar and the set rows can drive it. */
export function useRestTimer(defaultSeconds: number) {
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const endsAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (endsAt.current == null) return;
      setRemaining(Math.ceil((endsAt.current - Date.now()) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  function start() {
    endsAt.current = Date.now() + defaultSeconds * 1000;
    setRemaining(defaultSeconds);
    setRunning(true);
  }

  function toggle() {
    if (running) {
      setRunning(false);
      endsAt.current = null;
      setRemaining(defaultSeconds);
    } else {
      start();
    }
  }

  return { running, remaining, start, toggle };
}
