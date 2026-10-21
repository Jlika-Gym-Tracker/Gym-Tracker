"use client";

import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** A thin lime bar with a line of text under it. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 font-mono text-[10.5px] text-fg-dim uppercase">
        {label} · {pct}%
      </p>
    </div>
  );
}

/** The primary button of an import step: spins and disables while its work runs. */
export function RunButton({
  running,
  disabled,
  onClick,
  children,
  runningLabel,
}: {
  running: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  runningLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={running || disabled}
      aria-busy={running || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[11px] bg-accent px-[18px] py-3 text-[13px] font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi disabled:opacity-60",
        running && "cursor-progress",
      )}
    >
      {running ? <Loader2 className="size-3.5 flex-none animate-spin" aria-hidden /> : null}
      {running ? runningLabel : children}
    </button>
  );
}

/**
 * Asks before the tab closes mid-import. Leaving is safe — every batch already
 * sent is complete, and a re-import picks up the rest — but it is rarely meant.
 */
export function useWarnBeforeLeaving(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
