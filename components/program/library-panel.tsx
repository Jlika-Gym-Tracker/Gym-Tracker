"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { addExerciseToDay } from "@/app/actions/program";
import { createExercise, type ActionState } from "@/app/actions/exercises";
import type { LibraryExercise } from "@/lib/program/match";
import { findCandidates } from "@/lib/program/match";
import { Card } from "@/components/kit/card";
import { ActionButton } from "@/components/kit/action-button";
import { cn } from "@/lib/utils";
import { ExerciseThumb } from "./exercise-thumb";
import { useAction } from "@/lib/use-action";

const FILTERS = [
  { key: "all", label: "ALL", muscles: [] as string[] },
  { key: "chest", label: "CHEST", muscles: ["chest"] },
  { key: "back", label: "BACK", muscles: ["lats", "middle_back", "lower_back", "traps"] },
  { key: "shoulders", label: "DELTS", muscles: ["shoulders"] },
  { key: "arms", label: "ARMS", muscles: ["biceps", "triceps", "forearms"] },
  { key: "legs", label: "LEGS", muscles: ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"] },
  { key: "core", label: "CORE", muscles: ["abdominals"] },
  { key: "cardio", label: "CARDIO", muscles: [] as string[] },
];

const MUSCLE_LABEL: Record<string, string> = {
  chest: "Chest", lats: "Lats", middle_back: "Back", lower_back: "Lower back",
  traps: "Traps", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", quadriceps: "Quads", hamstrings: "Hamstrings",
  glutes: "Glutes", calves: "Calves", abdominals: "Core",
  abductors: "Abductors", adductors: "Adductors", neck: "Neck",
};

const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: "Barbell", dumbbell: "Dumbbell", machine: "Machine", cable: "Cable",
  body_only: "Bodyweight", bands: "Bands", kettlebells: "Kettlebell",
  ez_curl_bar: "EZ bar", exercise_ball: "Ball", medicine_ball: "Med ball",
  foam_roll: "Foam roll", other: "Other",
};

function inGroup(exercise: LibraryExercise, key: string) {
  if (key === "all") return true;
  if (key === "cardio") return exercise.tracking === "cardio";
  const group = FILTERS.find((f) => f.key === key);
  return exercise.tracking !== "cardio" && (group?.muscles.includes(exercise.primary_muscle) ?? false);
}

export function LibraryPanel({
  library,
  activeDayId,
  activeDayName,
}: {
  library: LibraryExercise[];
  activeDayId: string | null;
  activeDayName: string | null;
}) {
  const [filter, setFilter] = useState("all");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const { pending, run } = useAction();
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // Which row is being written, so the spinner lands on the one pressed.
  const [addingId, setAddingId] = useState<string | null>(null);

  const byGroup = useMemo(() => library.filter((e) => inGroup(e, filter)), [library, filter]);

  // Only equipment that something in the current group uses, so every chip on
  // screen has results behind it.
  const equipmentOptions = useMemo(
    () => [...new Set(byGroup.map((e) => e.equipment))].sort(
      (a, b) => (EQUIPMENT_LABEL[a] ?? a).localeCompare(EQUIPMENT_LABEL[b] ?? b),
    ),
    [byGroup],
  );
  const activeEquipment = equipment.filter((e) => equipmentOptions.includes(e));

  const results = useMemo(() => {
    const pool = activeEquipment.length
      ? byGroup.filter((e) => activeEquipment.includes(e.equipment))
      : byGroup;
    if (!query.trim()) return pool.slice(0, 40);
    // Reuse the paste matcher so search tolerates the same shorthand.
    return findCandidates(query, pool, 40).map((c) => c.exercise);
  }, [byGroup, activeEquipment, query]);

  function add(exerciseId: string) {
    if (!activeDayId) return;
    const fd = new FormData();
    fd.set("dayId", activeDayId);
    fd.set("exerciseId", exerciseId);
    fd.set("targetSets", "3");
    fd.set("repMin", "8");
    fd.set("repMax", "12");
    setJustAdded(exerciseId);
    setAddingId(exerciseId);
    run(async () => {
      try {
        await addExerciseToDay({}, fd);
      } finally {
        setAddingId(null);
      }
      setTimeout(() => setJustAdded(null), 900);
    });
  }

  function toggleEquipment(key: string) {
    setEquipment((current) =>
      current.includes(key) ? current.filter((e) => e !== key) : [...current, key],
    );
  }

  return (
    <Card className="rounded-[18px]">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">Exercise library</h2>
          <p className="mt-1 font-mono text-[10.5px] text-fg-dim uppercase">
            {library.length} movements
            {activeDayName ? ` · adding to ${activeDayName}` : " · pick a day first"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          aria-expanded={creating}
          className="hit ml-auto flex-none rounded-lg border border-stroke px-2.5 py-1.5 font-mono text-[10.5px] font-semibold text-fg-soft transition-colors hover:border-accent hover:text-accent"
        >
          {creating ? "CLOSE" : "+ YOUR OWN"}
        </button>
      </div>

      {creating ? (
        <CreateExercise
          initialName={query}
          onCreated={(name) => {
            setCreating(false);
            setQuery(name);
          }}
        />
      ) : null}

      <label className="mt-3.5 flex min-h-11 cursor-text items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2">
        <Search className="size-3.5 flex-none text-fg-dim" strokeWidth={1.5} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movements…"
          aria-label="Search the exercise library"
          className="w-full bg-transparent text-[12.5px] text-fg-2 outline-none placeholder:text-fg-dim"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-1.5 pointer-coarse:gap-y-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "hit rounded-lg border px-[11px] py-[7px] font-mono text-[11px] font-semibold transition-colors",
              filter === f.key
                ? "border-line-sel bg-accent-soft text-accent"
                : "border-line bg-surface-2 text-fg-soft hover:border-stroke",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {equipmentOptions.length > 1 ? (
        <div className="mt-2.5 mb-3">
          <div className="mb-1.5 flex items-baseline">
            <span className="eyebrow">Equipment</span>
            {activeEquipment.length ? (
              <button
                type="button"
                onClick={() => setEquipment([])}
                className="hit ml-auto font-mono text-[10px] text-fg-dim hover:text-accent"
              >
                CLEAR
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5 pointer-coarse:gap-y-3">
            {equipmentOptions.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleEquipment(key)}
                aria-pressed={activeEquipment.includes(key)}
                className={cn(
                  "hit rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  activeEquipment.includes(key)
                    ? "border-line-sel bg-accent-soft text-accent"
                    : "border-line text-fg-dim hover:border-stroke",
                )}
              >
                {EQUIPMENT_LABEL[key] ?? key}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-3" />
      )}

      <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
        {results.length === 0 ? (
          <p className="py-6 text-center text-xs text-fg-dim">
            {query ? `Nothing matches “${query}”.` : "Nothing here with that equipment."}{" "}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="font-semibold text-accent hover:text-accent-hi"
            >
              Add it as your own
            </button>
          </p>
        ) : (
          results.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              disabled={!activeDayId || pending}
              aria-busy={addingId === exercise.id || undefined}
              onClick={() => add(exercise.id)}
              title={activeDayId ? `Add to ${activeDayName}` : "Pick a day first"}
              className={cn(
                "flex items-center gap-[11px] rounded-[11px] border p-2 text-left transition-colors",
                justAdded === exercise.id
                  ? "border-accent bg-accent-soft"
                  : "border-[#171b1d] hover:border-line-hi hover:bg-[#15191b]",
                !activeDayId && "cursor-not-allowed opacity-50",
              )}
            >
              <ExerciseThumb
                src={exercise.image_start_url}
                muscle={exercise.primary_muscle}
                size={38}
                className="rounded-[9px]"
              />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] leading-[1.3] font-semibold">
                  {exercise.name}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-fg-dim uppercase">
                  {MUSCLE_LABEL[exercise.primary_muscle] ?? exercise.primary_muscle} ·{" "}
                  {EQUIPMENT_LABEL[exercise.equipment] ?? exercise.equipment}
                  {exercise.tracking === "time" ? " · timed" : ""}
                  {exercise.tracking === "cardio" ? " · cardio" : ""}
                  {exercise.owner_id ? <span className="text-accent"> · yours</span> : null}
                </span>
              </span>
              {addingId === exercise.id ? (
                <Loader2 className="ml-auto size-4 flex-none animate-spin text-accent" strokeWidth={2} />
              ) : (
                <Plus
                  className={cn(
                    "ml-auto size-4 flex-none",
                    justAdded === exercise.id ? "text-accent" : "text-[#3a4247]",
                  )}
                  strokeWidth={2}
                />
              )}
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

/** A name and a muscle are enough; the rest has sensible defaults. */
function CreateExercise({
  initialName,
  onCreated,
}: {
  initialName: string;
  onCreated: (name: string) => void;
}) {
  const [state, create] = useActionState(createExercise, {} as ActionState);
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (state.id) onCreated(name);
    // Only when a new exercise lands, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.id]);

  const control =
    "w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-base text-fg-2 outline-none focus:border-line-hi sm:text-[13px]";

  return (
    <form action={create} className="mt-3.5 flex flex-col gap-2.5 rounded-[12px] border border-line bg-surface-2 p-3">
      <label className="block">
        <span className="eyebrow mb-1.5 block">Name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sissy squat, Landmine press…"
          className={control}
        />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="eyebrow mb-1.5 block">Works</span>
          <select name="primaryMuscle" required defaultValue="" className={control}>
            <option value="" disabled>
              Pick one
            </option>
            {Object.entries(MUSCLE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Equipment</span>
          <select name="equipment" defaultValue="other" className={control}>
            {Object.entries(EQUIPMENT_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="eyebrow mb-1.5 block">Logged as</span>
        <select name="tracking" defaultValue="reps" className={control}>
          <option value="reps">Weight × reps</option>
          <option value="time">Time held (planks, hangs, carries)</option>
          <option value="cardio">Cardio — time and distance</option>
        </select>
      </label>
      <label className="block">
        <span className="eyebrow mb-1.5 block">How to do it — optional</span>
        <textarea
          name="description"
          maxLength={600}
          rows={2}
          placeholder="A line or two for future you."
          className={cn(control, "resize-none")}
        />
      </label>
      {state.error ? (
        <p className="rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {state.error}
        </p>
      ) : null}
      <ActionButton
        pendingLabel="Adding…"
        className="w-fit rounded-[10px] bg-accent px-4 py-2.5 text-[12.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
      >
        Add to my library
      </ActionButton>
    </form>
  );
}
