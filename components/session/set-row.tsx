"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { SetLog } from "@/lib/database.types";
import type { UnitSystem } from "@/lib/database.types";
import { displayToKg, kgToDisplay, trimNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

export type SetDraft = {
  weight: string;
  reps: string;
  rpe: string;
  isComplete: boolean;
};

export function toDraft(set: SetLog, system: UnitSystem): SetDraft {
  return {
    weight: set.weight_kg == null ? "" : trimNumber(kgToDisplay(Number(set.weight_kg), system), 2),
    reps: set.reps == null ? "" : String(set.reps),
    rpe: set.rpe == null ? "" : String(set.rpe),
    isComplete: set.is_complete,
  };
}

export function draftToPayload(draft: SetDraft, system: UnitSystem) {
  const weight = draft.weight.trim() === "" ? null : Number(draft.weight);
  const reps = draft.reps.trim() === "" ? null : Number(draft.reps);
  const rpe = draft.rpe.trim() === "" ? null : Number(draft.rpe);
  return {
    weightKg:
      weight == null || Number.isNaN(weight) ? null : displayToKg(weight, system),
    reps: reps == null || Number.isNaN(reps) ? null : Math.round(reps),
    rpe: rpe == null || Number.isNaN(rpe) ? null : rpe,
    isComplete: draft.isComplete,
  };
}

/**
 * Phone: set · kg · reps · RPE · tick. From `sm` up the row-remove column comes
 * back, revealed on hover. Shared with the header row so the two line up.
 */
export const SET_GRID =
  "grid grid-cols-[26px_1fr_1fr_56px_48px] items-center gap-2 sm:grid-cols-[36px_1fr_1fr_84px_40px_28px] sm:gap-2.5";

export function SetRow({
  index,
  draft,
  isPr,
  onChange,
  onCommit,
  onToggle,
  onRemove,
}: {
  index: number;
  draft: SetDraft;
  isPr: boolean;
  onChange: (next: SetDraft) => void;
  onCommit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState(draft);
  useEffect(() => setLocal(draft), [draft]);

  const done = draft.isComplete;
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

  return (
    <div className={cn(SET_GRID, "group py-1 sm:py-[5px]")}>
      {/* The phone's set column is 26px, so a PR badge stacks under the number. */}
      <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-[5px]">
        <span className="font-mono text-xs font-bold text-fg-soft">{index + 1}</span>
        {isPr ? (
          <span className="rounded-[3px] bg-accent px-1 py-0.5 font-mono text-[8.5px] font-extrabold tracking-[0.05em] text-[#0a0c0d]">
            PR
          </span>
        ) : null}
      </div>

      <input
        inputMode="decimal"
        aria-label={`Set ${index + 1} weight`}
        value={local.weight}
        onChange={(e) => update({ weight: e.target.value })}
        onBlur={onCommit}
        placeholder="—"
        className={field}
      />
      <input
        inputMode="numeric"
        aria-label={`Set ${index + 1} reps`}
        value={local.reps}
        onChange={(e) => update({ reps: e.target.value })}
        onBlur={onCommit}
        placeholder="—"
        className={field}
      />
      <input
        inputMode="decimal"
        aria-label={`Set ${index + 1} RPE`}
        value={local.rpe}
        onChange={(e) => update({ rpe: e.target.value })}
        onBlur={onCommit}
        placeholder="—"
        className={cn(field, "text-fg-soft")}
      />

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={`Mark set ${index + 1} ${done ? "incomplete" : "complete"}`}
        className={cn(
          // 48px on a phone — this is the button pressed most, often with
          // chalk on the hand and the bar still in the other.
          "flex size-12 items-center justify-center rounded-[11px] border transition-colors hover:border-accent sm:size-[34px] sm:rounded-[9px]",
          done ? "border-accent bg-accent" : "border-stroke bg-surface-2",
        )}
      >
        {done ? (
          <Check className="size-4 text-[#0a0c0d]" strokeWidth={3} />
        ) : (
          <span className="size-[9px] rounded-[2px] bg-[#2f3639]" />
        )}
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove set ${index + 1}`}
        className="hidden rounded p-1 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100 pointer-coarse:opacity-100 sm:block"
      >
        <X className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
