"use client";

import { useEffect, useState } from "react";
import { ChevronUp, GripVertical, Loader2, Plus, X } from "lucide-react";
import { removeProgramExercise, reorderDayExercises } from "@/app/actions/program";
import type { DayWithExercises } from "@/lib/program/queries";
import { DAY_NAMES } from "@/lib/dates";
import { trimNumber } from "@/lib/units";
import { cn } from "@/lib/utils";
import { ExerciseThumb } from "./exercise-thumb";
import { ActionButton } from "@/components/kit/action-button";
import { useAction } from "@/lib/use-action";

function loadLabel(item: DayWithExercises["exercises"][number], unit: string) {
  if (item.target_weight_kg == null) return null;
  return `${trimNumber(Number(item.target_weight_kg))} ${unit}`;
}

function repLabel(item: DayWithExercises["exercises"][number]) {
  const reps =
    item.rep_min == null
      ? "sets"
      : item.rep_max == null || item.rep_max === item.rep_min
        ? `${item.rep_min}`
        : `${item.rep_min}-${item.rep_max}`;
  const base = item.rep_min == null ? `${item.target_sets} sets` : `${item.target_sets} × ${reps}`;
  return item.per_side ? `${base} /side` : base;
}

export function DayCard({
  day,
  active,
  onActivate,
}: {
  day: DayWithExercises;
  active: boolean;
  onActivate: () => void;
}) {
  const { pending, run } = useAction();
  // Local copy so a drag reads smoothly; re-synced whenever the server data changes.
  const [order, setOrder] = useState(day.exercises);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => setOrder(day.exercises), [day.exercises]);

  const sets = day.exercises.reduce((total, e) => total + e.target_sets, 0);

  function commitOrder(next: typeof order) {
    setOrder(next);
    run(() => reorderDayExercises(day.id, next.map((e) => e.id)));
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...order];
    const from = next.findIndex((e) => e.id === dragId);
    const to = next.findIndex((e) => e.id === targetId);
    if (from === -1 || to === -1) return;
    next.splice(to, 0, next.splice(from, 1)[0]!);
    commitOrder(next);
  }

  /** Touch screens cannot drag HTML5 rows, so they reorder one step at a time. */
  function moveUp(id: string) {
    const from = order.findIndex((e) => e.id === id);
    if (from <= 0) return;
    const next = [...order];
    next.splice(from - 1, 0, next.splice(from, 1)[0]!);
    commitOrder(next);
  }

  return (
    <section
      onClick={onActivate}
      className={cn(
        "overflow-hidden rounded-[18px] border bg-surface transition-colors",
        active ? "border-line-sel" : "border-line",
        pending && "opacity-70",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2.5 border-b border-[#1a1e20] px-[18px] py-[15px]",
          day.is_rest ? "bg-transparent" : active ? "bg-accent-soft" : "bg-transparent",
        )}
      >
        <span
          className={cn(
            "font-mono text-[10.5px] font-bold tracking-[0.12em]",
            day.is_rest ? "text-fg-dim" : "text-accent",
          )}
        >
          {DAY_NAMES[day.day_index]?.toUpperCase()}
        </span>
        <h3
          className={cn(
            "text-[14.5px] font-bold tracking-[-0.01em]",
            day.is_rest && "text-fg-dim",
          )}
        >
          {day.name}
        </h3>
        <span className="ml-auto font-mono text-[10px] font-medium text-fg-dim">
          {day.is_rest && day.exercises.length === 0
            ? "REST"
            : `${day.exercises.length} EX · ${sets} SETS`}
        </span>
      </header>

      <div className="px-2.5 pt-2 pb-3">
        {order.map((item, index) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDragId(item.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(item.id);
            }}
            className={cn(
              "group flex cursor-grab items-center gap-[11px] rounded-[10px] px-2 py-[9px] transition-colors hover:bg-[#15191b] active:cursor-grabbing",
              dragId === item.id && "opacity-40",
            )}
          >
            <GripVertical
              className="size-3.5 flex-none text-stroke pointer-coarse:hidden"
              strokeWidth={1.5}
              aria-hidden
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                moveUp(item.id);
              }}
              disabled={index === 0 || pending}
              aria-label={`Move ${item.exercise.name} up`}
              className="hit hidden flex-none rounded p-0.5 text-fg-dim disabled:opacity-25 pointer-coarse:block"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                <ChevronUp className="size-4" strokeWidth={2} />
              )}
            </button>
            <ExerciseThumb
              src={item.exercise.image_start_url}
              muscle={item.exercise.primary_muscle}
            />
            <span className="min-w-0 truncate text-[12.5px] leading-[1.3] font-semibold">
              {item.exercise.name}
            </span>
            <span className="ml-auto flex flex-none items-baseline gap-2 font-mono text-[11px] font-semibold">
              {loadLabel(item, "kg") ? (
                <span className="text-accent">{loadLabel(item, "kg")}</span>
              ) : null}
              <span className="text-fg-soft">{repLabel(item)}</span>
            </span>
            <form
              action={(fd) => run(() => removeProgramExercise({}, fd))}
              className="flex-none"
            >
              <input type="hidden" name="id" value={item.id} />
              <ActionButton
                spinnerOnly
                aria-label={`Remove ${item.exercise.name}`}
                // Hover-revealed with a mouse; always there on touch, which has no hover.
                className="hit rounded p-0.5 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100 pointer-coarse:opacity-100"
              >
                <X className="size-3.5" strokeWidth={2} />
              </ActionButton>
            </form>
          </div>
        ))}

        <button
          type="button"
          onClick={onActivate}
          className={cn(
            "mx-2 mt-1.5 flex w-[calc(100%-1rem)] items-center justify-center gap-1.5 rounded-[10px] border border-dashed px-2 py-[9px] text-xs font-semibold transition-colors pointer-coarse:min-h-11",
            active
              ? "border-accent text-accent"
              : "border-stroke text-fg-dim hover:border-accent hover:text-accent",
          )}
        >
          <Plus className="size-3.5" strokeWidth={2} />
          {active ? "Pick from the library →" : "Add exercise"}
        </button>
      </div>

      {day.focus_note ? (
        <p className="border-t border-[#1a1e20] px-[18px] py-3 text-xs leading-[1.5] text-fg-soft">
          {day.focus_note}
        </p>
      ) : null}
    </section>
  );
}
