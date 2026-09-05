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
  const field = cn(
    "w-full rounded-[9px] border px-3 py-2.5 font-mono text-[13px] font-semibold outline-none transition-colors",
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
    <div className="group grid grid-cols-[36px_1fr_1fr_84px_40px_28px] items-center gap-2.5 py-[5px]">
      <div className="flex items-center gap-[5px]">
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
          "flex size-[34px] items-center justify-center rounded-[9px] border transition-colors hover:border-accent",
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
        className="rounded p-1 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
      >
        <X className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
