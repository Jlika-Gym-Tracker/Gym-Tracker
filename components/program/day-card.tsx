"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, GripVertical, Loader2, Pencil, Plus, X } from "lucide-react";
import {
  removeProgramExercise,
  reorderDayExercises,
  swapDays,
  updateDay,
  updateProgramExercise,
} from "@/app/actions/program";
import type { DayWithExercises } from "@/lib/program/queries";
import { dayLabel } from "@/lib/dates";
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
  days,
  weekStart,
  active,
  onActivate,
}: {
  day: DayWithExercises;
  /** Every day of the week, so this one can be swapped with another. */
  days: DayWithExercises[];
  /** The week's own start date, which decides what weekday each position is. */
  weekStart: string;
  active: boolean;
  onActivate: () => void;
}) {
  const { pending, run } = useAction();
  const save = useAction();
  const [editing, setEditing] = useState(false);
  const [editingExercise, setEditingExercise] = useState<string | null>(null);
  const [exerciseError, setExerciseError] = useState<string | null>(null);
  const exerciseSave = useAction();
  const move = useAction();

  const ordered = [...days].sort((a, b) => a.day_index - b.day_index);
  const at = ordered.findIndex((d) => d.id === day.id);
  const previous = at > 0 ? ordered[at - 1] : undefined;
  const next = at >= 0 && at < ordered.length - 1 ? ordered[at + 1] : undefined;
  const [error, setError] = useState<string | null>(null);
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
          {dayLabel(weekStart, day.day_index).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h3
            className={cn(
              "truncate text-[14.5px] font-bold tracking-[-0.01em]",
              day.is_rest && "text-fg-dim",
            )}
          >
            {day.name}
          </h3>
          {day.focus_note ? (
            <p className="truncate text-[11px] text-fg-dim">{day.focus_note}</p>
          ) : null}
        </div>
        <span className="ml-auto font-mono text-[10px] font-medium text-fg-dim">
          {day.is_rest && day.exercises.length === 0
            ? "REST"
            : `${day.exercises.length} EX · ${sets} SETS`}
        </span>
        <button
          type="button"
          disabled={!previous || move.pending}
          aria-label={
            previous
              ? `Move ${day.name} to ${dayLabel(weekStart, previous.day_index)}`
              : "Already the first day"
          }
          onClick={(e) => {
            e.stopPropagation();
            if (previous) move.run(() => swapDays(day.id, previous.id));
          }}
          className="hit flex-none rounded p-1 text-fg-dim transition-colors hover:text-accent disabled:opacity-25"
        >
          {move.pending ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <ChevronLeft className="size-3.5" strokeWidth={2} />
          )}
        </button>
        <button
          type="button"
          disabled={!next || move.pending}
          aria-label={
            next
              ? `Move ${day.name} to ${dayLabel(weekStart, next.day_index)}`
              : "Already the last day"
          }
          onClick={(e) => {
            e.stopPropagation();
            if (next) move.run(() => swapDays(day.id, next.id));
          }}
          className="hit flex-none rounded p-1 text-fg-dim transition-colors hover:text-accent disabled:opacity-25"
        >
          <ChevronRight className="size-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label={`Edit ${day.name}`}
          aria-expanded={editing}
          onClick={(e) => {
            e.stopPropagation();
            setEditing((v) => !v);
          }}
          className="hit -mr-1 flex-none rounded p-1 text-fg-dim transition-colors hover:text-accent"
        >
          <Pencil className="size-3.5" strokeWidth={2} />
        </button>
      </header>

      {editing ? (
        <form
          onClick={(e) => e.stopPropagation()}
          action={(fd) =>
            save.run(async () => {
              const result = await updateDay({}, fd);
              setError(result.error ?? null);
              if (!result.error) setEditing(false);
            })
          }
          className="flex flex-col gap-2 border-b border-[#1a1e20] bg-surface-2 px-3.5 py-3"
        >
          <input type="hidden" name="id" value={day.id} />
          <label className="block">
            <span className="eyebrow mb-1.5 block">Day name</span>
            <input
              name="name"
              defaultValue={day.name}
              required
              maxLength={40}
              placeholder="Push, Legs, Upper A…"
              className="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-line-hi"
            />
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">Focus note — optional</span>
            <input
              name="focusNote"
              defaultValue={day.focus_note ?? ""}
              maxLength={80}
              placeholder="Chest-led, long rests"
              className="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-line-hi"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2.5 text-[12.5px] text-fg-muted">
            <input
              type="checkbox"
              name="isRest"
              defaultChecked={day.is_rest}
              className="size-4 accent-[#c9f24d]"
            />
            Rest day
            {day.exercises.length > 0 ? (
              <span className="text-fg-dim">
                — this day still has {day.exercises.length} exercise
                {day.exercises.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </label>

          <div className="border-t border-[#1a1e20] pt-2.5">
            <span className="eyebrow mb-1.5 block">Swap this day with</span>
            <div className="flex flex-wrap gap-1.5">
              {ordered
                .filter((other) => other.id !== day.id)
                .map((other) => (
                  <button
                    key={other.id}
                    type="button"
                    disabled={move.pending}
                    onClick={() => move.run(() => swapDays(day.id, other.id))}
                    className="hit rounded-full border border-line bg-surface px-2.5 py-1.5 font-mono text-[10.5px] font-semibold text-fg-soft transition-colors hover:border-line-sel hover:text-accent disabled:opacity-50"
                  >
                    {dayLabel(weekStart, other.day_index).toUpperCase()}
                    <span className="ml-1 text-fg-dim">{other.name}</span>
                  </button>
                ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-[1.5] text-fg-dim">
              The exercises move with the day, and anything already logged against
              it stays attached.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ActionButton
              pendingLabel="Saving…"
              className="rounded-[10px] bg-accent px-4 py-2.5 text-[12.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
            >
              Save day
            </ActionButton>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setEditing(false);
              }}
              className="rounded-[10px] border border-stroke px-3 py-2.5 text-[12.5px] font-semibold text-fg-muted hover:bg-hover"
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p className="rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="px-2.5 pt-2 pb-3">
        {order.map((item, index) => (
          <div key={item.id}>
          <div
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingExercise((current) => (current === item.id ? null : item.id));
              }}
              aria-label={`Edit sets and reps for ${item.exercise.name}`}
              aria-expanded={editingExercise === item.id}
              className="hit ml-auto flex flex-none items-baseline gap-2 rounded px-1 font-mono text-[11px] font-semibold hover:text-accent"
            >
              {loadLabel(item, "kg") ? (
                <span className="text-accent">{loadLabel(item, "kg")}</span>
              ) : null}
              <span className="text-fg-soft">{repLabel(item)}</span>
            </button>
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

          {editingExercise === item.id ? (
            <form
              onClick={(e) => e.stopPropagation()}
              action={(fd) =>
                exerciseSave.run(async () => {
                  const result = await updateProgramExercise({}, fd);
                  setExerciseError(result.error ?? null);
                  if (!result.error) setEditingExercise(null);
                })
              }
              className="mx-2 mb-2 flex flex-col gap-2 rounded-[10px] border border-line bg-surface-2 p-2.5"
            >
              <input type="hidden" name="id" value={item.id} />
              <div className="grid grid-cols-4 gap-2">
                <label className="block">
                  <span className="eyebrow mb-1 block">Sets</span>
                  <input
                    name="targetSets" type="number" min={1} max={20} required
                    defaultValue={item.target_sets}
                    className="w-full rounded-[8px] border border-line bg-surface px-2 py-2 text-center font-mono text-[13px] outline-none focus:border-line-hi"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">Reps</span>
                  <input
                    name="repMin" type="number" min={1} max={100} placeholder="—"
                    defaultValue={item.rep_min ?? ""}
                    className="w-full rounded-[8px] border border-line bg-surface px-2 py-2 text-center font-mono text-[13px] outline-none focus:border-line-hi"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">To</span>
                  <input
                    name="repMax" type="number" min={1} max={100} placeholder="—"
                    defaultValue={item.rep_max ?? ""}
                    className="w-full rounded-[8px] border border-line bg-surface px-2 py-2 text-center font-mono text-[13px] outline-none focus:border-line-hi"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1 block">kg</span>
                  <input
                    name="targetWeightKg" type="number" min={0} max={1000} step="0.5" placeholder="—"
                    defaultValue={item.target_weight_kg ?? ""}
                    className="w-full rounded-[8px] border border-line bg-surface px-2 py-2 text-center font-mono text-[13px] outline-none focus:border-line-hi"
                  />
                </label>
              </div>
              <input
                name="note" defaultValue={item.note ?? ""} maxLength={200}
                placeholder="Note — pause 1s, last set to failure…"
                className="w-full rounded-[8px] border border-line bg-surface px-2.5 py-2 text-[12.5px] outline-none focus:border-line-hi"
              />
              <label className="flex min-h-11 items-center gap-2 text-[12px] text-fg-muted">
                <input type="checkbox" name="perSide" defaultChecked={item.per_side} className="size-4 accent-[#c9f24d]" />
                Per side
              </label>
              <div className="flex items-center gap-2">
                <ActionButton
                  pendingLabel="Saving…"
                  className="rounded-[8px] bg-accent px-3 py-2 text-[12px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
                >
                  Save
                </ActionButton>
                <button
                  type="button"
                  onClick={() => { setExerciseError(null); setEditingExercise(null); }}
                  className="rounded-[8px] border border-stroke px-3 py-2 text-[12px] font-semibold text-fg-muted hover:bg-hover"
                >
                  Cancel
                </button>
                <span className="text-[11px] text-fg-dim">Leave kg empty to decide on the day.</span>
              </div>
              {exerciseError ? (
                <p className="rounded-[8px] border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger">
                  {exerciseError}
                </p>
              ) : null}
            </form>
          ) : null}
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
