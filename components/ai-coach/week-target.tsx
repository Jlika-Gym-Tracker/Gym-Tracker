"use client";

import { format, parseISO } from "date-fns";
import type { WeekSlot } from "@/lib/ai-coach/view";
import { Choice } from "./ui";

export type Target = "this" | "next";

/** Which week an apply writes into. A week with content says it will be replaced. */
export function WeekTarget({
  value,
  onChange,
  thisWeek,
  nextWeek,
}: {
  value: Target;
  onChange: (next: Target) => void;
  thisWeek: WeekSlot;
  nextWeek: WeekSlot;
}) {
  const detail = (slot: WeekSlot) =>
    slot.exercises > 0 ? `Has ${slot.exercises} exercises — replaced, snapshot kept` : "Empty";
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Choice selected={value === "this"} onClick={() => onChange("this")} detail={detail(thisWeek)}>
        This week · {format(parseISO(thisWeek.weekStart), "MMM d")}
      </Choice>
      <Choice selected={value === "next"} onClick={() => onChange("next")} detail={detail(nextWeek)}>
        Next week · {format(parseISO(nextWeek.weekStart), "MMM d")}
      </Choice>
    </div>
  );
}

/** The ask before replacing a week that already has exercises. */
export function ReplaceConfirm({
  weekStart,
  label,
  exercises,
  pending,
  onConfirm,
  onCancel,
}: {
  weekStart: string;
  label: string;
  exercises: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Replace this week?" className="rounded-[14px] border border-warn/40 bg-warn-soft p-4">
      <p className="text-[13px] font-semibold text-fg-2">
        The week of {format(parseISO(weekStart), "MMM d")} already has {exercises} exercises
        {label ? ` (“${label}”)` : ""}.
      </p>
      <p className="mt-1 text-[12px] leading-[1.5] text-fg-muted">
        Replace it? A snapshot is kept first, so Revert in History puts it back exactly. Logged sessions are
        never touched.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          aria-busy={pending || undefined}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-warn px-4 py-2.5 text-[12.5px] font-bold text-[#0a0c0d] disabled:opacity-60"
        >
          Replace it
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-[10px] border border-stroke bg-ghost px-4 py-2.5 text-[12.5px] font-semibold text-fg-2 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
