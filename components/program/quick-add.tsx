"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { addExerciseToDay } from "@/app/actions/program";
import { createExercise } from "@/app/actions/exercises";
import { searchLibrary, type LibraryExercise } from "@/lib/program/match";
import { MUSCLE_LABELS, MUSCLES, guessEquipment, guessMuscle } from "@/lib/import/guess";
import type { Muscle, Tracking } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";
import { ExerciseThumb } from "./exercise-thumb";

const HOLD_WORDS = /\b(plank|hold|hang|wall ?sit|carry|carries|l-?sit|hollow)\b/i;
const CARDIO_WORDS =
  /\b(run|jog|treadmill|bike|cycling|spin|elliptical|cross ?trainer|stair|stepper|walk|rower|erg|swim|jump rope|skipping)\b/i;

/** A first guess at how a new movement is logged; the select shows it and can change it. */
function guessTrackingFromName(name: string): Tracking {
  if (CARDIO_WORDS.test(name) && !/\blunge/i.test(name)) return "cardio";
  if (HOLD_WORDS.test(name)) return "time";
  return "reps";
}

/**
 * Search the whole library from inside a day and add with one tap — or keep a
 * movement the library does not have as your own. Lives in the day card so it
 * works wherever the library panel happens to sit on the screen.
 */
export function QuickAdd({
  dayId,
  dayName,
  library,
  onClose,
}: {
  dayId: string;
  dayName: string;
  library: LibraryExercise[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [muscle, setMuscle] = useState<Muscle>("chest");
  const [tracking, setTracking] = useState<Tracking>("reps");
  const add = useAction();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const results = useMemo(
    () => (query.trim() ? searchLibrary(query, library, 8) : []),
    [query, library],
  );
  const name = query.trim();
  const exact = results.some((r) => r.name.toLowerCase() === name.toLowerCase());

  function addToDay(exerciseId: string) {
    setError(null);
    setAddingId(exerciseId);
    add.run(async () => {
      try {
        const fd = new FormData();
        fd.set("dayId", dayId);
        fd.set("exerciseId", exerciseId);
        // Timed and cardio movements get their own shape on the server.
        fd.set("targetSets", "3");
        fd.set("repMin", "8");
        fd.set("repMax", "12");
        const result = await addExerciseToDay({}, fd);
        if (result.error) setError(result.error);
        else setAdded((prev) => [...prev, exerciseId]);
      } finally {
        setAddingId(null);
      }
    });
  }

  function startCreate() {
    setMuscle(guessMuscle(name, null));
    setTracking(guessTrackingFromName(name));
    setCreating(true);
  }

  function createAndAdd() {
    setError(null);
    add.run(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("primaryMuscle", muscle);
      fd.set("equipment", guessEquipment(name));
      fd.set("tracking", tracking);
      const created = await createExercise({}, fd);
      if (created.error || !created.id) {
        setError(created.error ?? "Could not add that exercise.");
        return;
      }
      const day = new FormData();
      day.set("dayId", dayId);
      day.set("exerciseId", created.id);
      day.set("targetSets", "3");
      day.set("repMin", "8");
      day.set("repMax", "12");
      const result = await addExerciseToDay({}, day);
      if (result.error) setError(result.error);
      else {
        setCreating(false);
        setQuery("");
        setAdded((prev) => [...prev, created.id!]);
      }
    });
  }

  const control =
    "rounded-[8px] border border-line bg-surface px-2 py-1.5 text-base text-fg-2 outline-none focus:border-line-hi sm:text-[12px]";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="mx-2 mt-1.5 flex flex-col gap-2 rounded-[10px] border border-line-hi bg-surface-2 p-2.5"
    >
      <div className="flex items-center gap-2">
        <label className="flex min-h-10 flex-1 items-center gap-2 rounded-[8px] border border-line bg-surface px-2.5">
          <Search className="size-3.5 flex-none text-fg-dim" strokeWidth={1.5} />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCreating(false);
            }}
            placeholder={`Add to ${dayName} — search ${library.length} movements`}
            aria-label={`Search exercises to add to ${dayName}`}
            className="w-full min-w-0 bg-transparent py-2 text-base text-fg-2 outline-none placeholder:text-fg-dim sm:text-[12.5px]"
          />
        </label>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-10 flex-none items-center justify-center rounded-[8px] text-fg-dim hover:text-fg"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      {results.length ? (
        <div className="flex flex-col gap-1">
          {results.map((exercise) => {
            const done = added.includes(exercise.id);
            return (
              <button
                key={exercise.id}
                type="button"
                disabled={add.pending}
                onClick={() => addToDay(exercise.id)}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-[8px] border px-2 py-1.5 text-left transition-colors disabled:opacity-60",
                  done ? "border-accent bg-accent-soft" : "border-transparent hover:border-line-hi hover:bg-surface",
                )}
              >
                <ExerciseThumb src={exercise.image_start_url} muscle={exercise.primary_muscle} size={28} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                  {exercise.name}
                  {exercise.tracking === "time" ? (
                    <span className="ml-1.5 font-mono text-[9.5px] text-fg-dim uppercase">timed</span>
                  ) : exercise.tracking === "cardio" ? (
                    <span className="ml-1.5 font-mono text-[9.5px] text-fg-dim uppercase">cardio</span>
                  ) : null}
                  {exercise.owner_id ? (
                    <span className="ml-1.5 font-mono text-[9.5px] text-accent uppercase">yours</span>
                  ) : null}
                </span>
                {addingId === exercise.id ? (
                  <Loader2 className="size-4 flex-none animate-spin text-accent" strokeWidth={2} />
                ) : done ? (
                  <Check className="size-4 flex-none text-accent" strokeWidth={2.5} />
                ) : (
                  <Plus className="size-4 flex-none text-fg-dim" strokeWidth={2} />
                )}
              </button>
            );
          })}
        </div>
      ) : name ? (
        <p className="px-1 text-[12px] text-fg-dim">Nothing in the library matches “{name}”.</p>
      ) : (
        <p className="px-1 text-[12px] text-fg-dim">
          Type a name — “bench”, “plank”, “treadmill”. Tap a result to add it; add as many as you like.
        </p>
      )}

      {name.length >= 2 && !exact ? (
        creating ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-line bg-surface p-2">
            <span className="w-full text-[12px] font-semibold text-fg-2">
              Add “{name}” as your own exercise
            </span>
            <label className="flex items-center gap-1.5 text-[11.5px] text-fg-soft">
              Works
              <select value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle)} className={control}>
                {MUSCLES.map((m) => (
                  <option key={m} value={m}>
                    {MUSCLE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11.5px] text-fg-soft">
              Logged as
              <select value={tracking} onChange={(e) => setTracking(e.target.value as Tracking)} className={control}>
                <option value="reps">Weight × reps</option>
                <option value="time">Time held</option>
                <option value="cardio">Cardio</option>
              </select>
            </label>
            <button
              type="button"
              onClick={createAndAdd}
              disabled={add.pending}
              aria-busy={add.pending || undefined}
              className="ml-auto flex items-center gap-1.5 rounded-[8px] bg-accent px-3 py-2 text-[12px] font-bold text-[#0a0c0d] hover:bg-accent-hi disabled:opacity-60"
            >
              {add.pending ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2} /> : null}
              Add to {dayName}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startCreate}
            className="flex min-h-10 items-center gap-1.5 rounded-[8px] border border-dashed border-stroke px-2.5 text-left text-[12px] font-semibold text-fg-soft hover:border-accent hover:text-accent"
          >
            <Plus className="size-3.5 flex-none" strokeWidth={2} />
            Not in the library? Add “{name}” as your own exercise
          </button>
        )
      ) : null}

      {error ? (
        <p className="rounded-[8px] border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
