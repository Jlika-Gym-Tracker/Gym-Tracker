"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { addExerciseToDay } from "@/app/actions/program";
import type { LibraryExercise } from "@/lib/program/match";
import { findCandidates } from "@/lib/program/match";
import { Card } from "@/components/kit/card";
import { cn } from "@/lib/utils";
import { ExerciseThumb } from "./exercise-thumb";
import { useAction } from "@/lib/use-action";

const FILTERS = [
  { key: "all", label: "ALL", muscles: [] as string[] },
  { key: "chest", label: "CHEST", muscles: ["chest"] },
  { key: "back", label: "BACK", muscles: ["lats", "middle_back", "lower_back", "traps"] },
  { key: "shoulders", label: "DELTS", muscles: ["shoulders"] },
  { key: "arms", label: "ARMS", muscles: ["biceps", "triceps", "forearms"] },
  { key: "legs", label: "LEGS", muscles: ["quadriceps", "hamstrings", "glutes", "calves"] },
  { key: "core", label: "CORE", muscles: ["abdominals"] },
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
  const [query, setQuery] = useState("");
  const { pending, run } = useAction();
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // Which row is being written, so the spinner lands on the one pressed.
  const [addingId, setAddingId] = useState<string | null>(null);

  const results = useMemo(() => {
    const group = FILTERS.find((f) => f.key === filter);
    const byMuscle =
      !group || group.muscles.length === 0
        ? library
        : library.filter((e) => group.muscles.includes(e.primary_muscle));

    if (!query.trim()) return byMuscle.slice(0, 40);
    // Reuse the paste matcher so search tolerates the same shorthand.
    return findCandidates(query, byMuscle, 40).map((c) => c.exercise);
  }, [library, filter, query]);

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

  return (
    <Card className="rounded-[18px]">
      <h2 className="text-[15px] font-bold">Exercise library</h2>
      <p className="mt-1 font-mono text-[10.5px] text-fg-dim uppercase">
        {library.length} movements
        {activeDayName ? ` · adding to ${activeDayName}` : " · pick a day first"}
      </p>

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

      <div className="my-3 flex flex-wrap gap-1.5 pointer-coarse:gap-y-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
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

      <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
        {results.length === 0 ? (
          <p className="py-6 text-center text-xs text-fg-dim">
            Nothing matches “{query}”.
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
