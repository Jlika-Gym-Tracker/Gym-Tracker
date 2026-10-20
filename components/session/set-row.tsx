"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Play, Square, X } from "lucide-react";
import type { EffortScale, SetLog, Tracking, UnitSystem } from "@/lib/database.types";
import {
  displayToKg,
  displayToMetres,
  formatDuration,
  kgToDisplay,
  metresToDisplay,
  trimNumber,
} from "@/lib/units";
import { fromScale, toScale } from "@/lib/training/effort";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";

/**
 * One set as typed, in display units. `duration` is seconds for a timed hold
 * and minutes for cardio — the unit each is naturally read in.
 */
export type SetDraft = {
  weight: string;
  reps: string;
  effort: string;
  duration: string;
  distance: string;
  isComplete: boolean;
};

export type RowMode = {
  tracking: Tracking;
  effort: EffortScale;
  system: UnitSystem;
};

export function toDraft(set: SetLog, { tracking, effort, system }: RowMode): SetDraft {
  const seconds = set.duration_s;
  return {
    weight: set.weight_kg == null ? "" : trimNumber(kgToDisplay(Number(set.weight_kg), system), 2),
    reps: set.reps == null ? "" : String(set.reps),
    effort: (() => {
      const value = toScale(set.rpe, effort);
      return value == null ? "" : String(value);
    })(),
    duration:
      seconds == null
        ? ""
        : tracking === "cardio"
          ? trimNumber(seconds / 60, 1)
          : String(seconds),
    distance:
      set.distance_m == null ? "" : trimNumber(metresToDisplay(Number(set.distance_m), system), 2),
    isComplete: set.is_complete,
  };
}

function num(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export function draftToPayload(draft: SetDraft, { tracking, effort, system }: RowMode) {
  const weight = num(draft.weight);
  const reps = num(draft.reps);
  const duration = num(draft.duration);
  const distance = num(draft.distance);
  return {
    weightKg: weight == null || tracking === "cardio" ? null : displayToKg(weight, system),
    reps: reps == null || tracking !== "reps" ? null : Math.round(reps),
    // Undefined when the column is hidden, so a hidden column never wipes a
    // rating logged before the setting was switched off.
    rpe: effort === "off" || tracking !== "reps" ? undefined : fromScale(num(draft.effort), effort),
    durationS:
      duration == null || tracking === "reps"
        ? null
        : Math.round(tracking === "cardio" ? duration * 60 : duration),
    distanceM:
      distance == null || tracking !== "cardio"
        ? null
        : Math.round(displayToMetres(distance, system) * 10) / 10,
    isComplete: draft.isComplete,
  };
}

/** What a set needs before it can be ticked off, in words for the error line. */
export function missingForTick(draft: SetDraft, tracking: Tracking): string | null {
  if (tracking === "reps") return draft.reps.trim() ? null : "Add reps before ticking the set off.";
  if (tracking === "time") return draft.duration.trim() ? null : "Add the time you held before ticking the set off.";
  return draft.duration.trim() || draft.distance.trim()
    ? null
    : "Add a time or a distance before ticking it off.";
}

/**
 * Phone: set · load · reps · effort · tick. From `sm` up the row-remove column
 * comes back, revealed on hover. Without an effort column (switched off, or a
 * timed or cardio movement) the row closes up. Shared with the header row so
 * the two line up.
 */
export function setGrid(withEffort: boolean) {
  return withEffort
    ? "grid grid-cols-[26px_1fr_1fr_56px_48px] items-center gap-2 sm:grid-cols-[36px_1fr_1fr_84px_40px_28px] sm:gap-2.5"
    : "grid grid-cols-[26px_1fr_1fr_48px] items-center gap-2 sm:grid-cols-[36px_1fr_1fr_40px_28px] sm:gap-2.5";
}

export type WorkTimer = {
  running: boolean;
  /** Seconds held so far. */
  elapsed: number;
};

export function SetRow({
  index,
  draft,
  mode,
  isPr,
  placeholders,
  work,
  onChange,
  onCommit,
  onToggle,
  onRemove,
  onStartWork,
  onStopWork,
}: {
  index: number;
  draft: SetDraft;
  mode: RowMode;
  isPr: boolean;
  placeholders: { reps?: string; duration?: string };
  work?: WorkTimer;
  onChange: (next: SetDraft) => void;
  onCommit: () => Promise<void> | void;
  onToggle: () => Promise<void> | void;
  onRemove: () => Promise<void> | void;
  onStartWork?: () => void;
  onStopWork?: () => void;
}) {
  // Per row, so saving one set never freezes the others.
  const tick = useAction();
  const drop = useAction();
  const [local, setLocal] = useState(draft);
  useEffect(() => setLocal(draft), [draft]);

  const { tracking } = mode;
  const withEffort = tracking === "reps" && mode.effort !== "off";
  const done = draft.isComplete;
  const label = `Set ${index + 1}`;
  // 16px on a phone: iOS Safari zooms the whole page into any input set
  // smaller, which on a set grid means pinching back out after every rep.
  const field = cn(
    "w-full min-w-0 rounded-[9px] border px-2 py-3 text-center font-mono text-base font-semibold outline-none transition-colors",
    "sm:px-3 sm:py-2.5 sm:text-left sm:text-[13px]",
    done
      ? "border-line-hi bg-done text-accent"
      : "border-line bg-surface-2 text-fg-2 focus:border-line-hi",
  );

  function update(patch: Partial<SetDraft>) {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  }

  const input = (
    key: keyof Omit<SetDraft, "isComplete">,
    aria: string,
    opts: { numeric?: boolean; placeholder?: string; className?: string } = {},
  ) => (
    <input
      inputMode={opts.numeric ? "numeric" : "decimal"}
      aria-label={`${label} ${aria}`}
      value={local[key]}
      onChange={(e) => update({ [key]: e.target.value })}
      onBlur={onCommit}
      placeholder={opts.placeholder ?? "—"}
      className={cn(field, opts.className)}
    />
  );

  return (
    <div className={cn(setGrid(withEffort), "group py-1 sm:py-[5px]")}>
      {/* The phone's set column is 26px, so a PR badge stacks under the number. */}
      <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-[5px]">
        <span className="font-mono text-xs font-bold text-fg-soft">{index + 1}</span>
        {isPr ? (
          <span className="rounded-[3px] bg-accent px-1 py-0.5 font-mono text-[8.5px] font-extrabold tracking-[0.05em] text-[#0a0c0d]">
            PR
          </span>
        ) : null}
      </div>

      {tracking === "cardio" ? (
        <>
          {input("duration", "minutes", { placeholder: placeholders.duration })}
          {input("distance", "distance")}
        </>
      ) : (
        <>
          {input("weight", "weight")}
          {tracking === "time" ? (
            <div className="flex min-w-0 items-center gap-1.5">
              {work?.running ? (
                <span
                  aria-live="off"
                  className={cn(field, "border-line-hi bg-accent-soft text-accent tabular-nums")}
                >
                  {formatDuration(work.elapsed)}
                </span>
              ) : (
                input("duration", "seconds held", { numeric: true, placeholder: placeholders.duration })
              )}
              {!done && (onStartWork || work?.running) ? (
                <button
                  type="button"
                  onClick={work?.running ? onStopWork : onStartWork}
                  aria-label={work?.running ? `Stop the clock for ${label}` : `Start the clock for ${label}`}
                  className={cn(
                    "flex size-11 flex-none items-center justify-center rounded-[9px] border transition-colors sm:size-[38px]",
                    work?.running
                      ? "border-accent bg-accent text-[#0a0c0d]"
                      : "border-stroke bg-surface-2 text-fg-muted hover:border-accent hover:text-accent",
                  )}
                >
                  {work?.running ? (
                    <Square className="size-3.5" strokeWidth={2.5} />
                  ) : (
                    <Play className="size-3.5" strokeWidth={2.5} />
                  )}
                </button>
              ) : null}
            </div>
          ) : (
            input("reps", "reps", { numeric: true, placeholder: placeholders.reps })
          )}
        </>
      )}

      {withEffort ? input("effort", mode.effort.toUpperCase(), { className: "text-fg-soft" }) : null}

      <button
        type="button"
        onClick={() => tick.run(() => onToggle())}
        disabled={tick.pending}
        aria-busy={tick.pending || undefined}
        aria-pressed={done}
        aria-label={`Mark ${label.toLowerCase()} ${done ? "incomplete" : "complete"}`}
        className={cn(
          // 48px on a phone — this is the button pressed most, often with
          // chalk on the hand and the bar still in the other.
          "flex size-12 items-center justify-center rounded-[11px] border transition-colors hover:border-accent sm:size-[34px] sm:rounded-[9px]",
          done ? "border-accent bg-accent" : "border-stroke bg-surface-2",
        )}
      >
        {tick.pending ? (
          <Loader2
            className={cn("size-4 animate-spin", done ? "text-[#0a0c0d]" : "text-fg-muted")}
            strokeWidth={2.5}
          />
        ) : done ? (
          <Check className="size-4 text-[#0a0c0d]" strokeWidth={3} />
        ) : (
          <span className="size-[9px] rounded-[2px] bg-[#2f3639]" />
        )}
      </button>

      <button
        type="button"
        onClick={() => drop.run(() => onRemove())}
        disabled={drop.pending}
        aria-busy={drop.pending || undefined}
        aria-label={`Remove ${label.toLowerCase()}`}
        className="hidden rounded p-1 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100 pointer-coarse:opacity-100 sm:block"
      >
        {drop.pending ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <X className="size-3.5" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}
