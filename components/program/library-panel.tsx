"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { addExerciseToDay } from "@/app/actions/program";
import type { LibraryExercise } from "@/lib/program/match";
import { isPreferred, searchLibrary } from "@/lib/program/match";
import { Card } from "@/components/kit/card";
import { CreateExercise } from "@/components/exercises/exercise-form";
import {
  MUSCLE_GROUPS,
  MUSCLE_LABEL,
  equipmentLabel,
  sortEquipment,
} from "@/lib/exercises/taxonomy";
import type { Muscle } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { ExerciseThumb } from "./exercise-thumb";
import { useAction } from "@/lib/use-action";

const FILTERS = [
  { key: "all", label: "ALL", muscles: [] as readonly Muscle[] },
  ...MUSCLE_GROUPS,
  { key: "cardio", label: "CARDIO", muscles: [] as readonly Muscle[] },
];

/** Rows drawn at a time: the whole library is ~750, more than a list should hold at once. */
const PAGE = 60;

function inGroup(exercise: LibraryExercise, key: string) {
  if (key === "all") return true;
  if (key === "cardio") return exercise.tracking === "cardio";
  const group = FILTERS.find((f) => f.key === key);
  return (
    exercise.tracking !== "cardio" &&
    (group?.muscles.includes(exercise.primary_muscle as Muscle) ?? false)
  );
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
  // The curated movements and your own by default; the whole library on request.
  const [showAll, setShowAll] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const { pending, run } = useAction();
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // Which row is being written, so the spinner lands on the one pressed.
  const [addingId, setAddingId] = useState<string | null>(null);

  const shortList = useMemo(() => library.filter(isPreferred), [library]);
  const searching = query.trim().length > 0;

  // A search always reaches the whole library; browsing starts from the short list.
  const pool = useMemo(() => {
    const base = (searching || showAll ? library : shortList).filter((e) => inGroup(e, filter));
    // Reuse the matcher's shorthand ("DB" for dumbbell), plus prefixes as you type.
    return searching ? searchLibrary(query, base) : base;
  }, [library, shortList, searching, showAll, filter, query]);

  // Only equipment that something on screen uses, so every chip has results.
  const equipmentOptions = useMemo(() => sortEquipment(pool.map((e) => e.equipment)), [pool]);
  const activeEquipment = equipment.filter((e) => equipmentOptions.includes(e));

  const results = useMemo(
    () => (activeEquipment.length ? pool.filter((e) => activeEquipment.includes(e.equipment)) : pool),
    [pool, activeEquipment],
  );

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
    setShown(PAGE);
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
            {library.filter((e) => e.featured).length} featured · {library.length} in all
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
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          placeholder={`Search all ${library.length} movements…`}
          aria-label="Search the exercise library"
          className="w-full bg-transparent text-[12.5px] text-fg-2 outline-none placeholder:text-fg-dim"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-1.5 pointer-coarse:gap-y-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setShown(PAGE);
            }}
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
        <div className="mt-2.5">
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
                {equipmentLabel(key)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 mb-2 flex items-baseline gap-2">
        <span className="eyebrow">
          {searching
            ? `${results.length} ${results.length === 1 ? "match" : "matches"} in the whole library`
            : showAll
              ? `All ${results.length}`
              : `${results.length} featured & yours`}
        </span>
        {searching ? null : (
          <button
            type="button"
            onClick={() => {
              setShowAll((v) => !v);
              setShown(PAGE);
            }}
            aria-pressed={showAll}
            className="hit ml-auto font-mono text-[10px] font-semibold text-fg-dim hover:text-accent"
          >
            {showAll ? "FEATURED ONLY" : `SHOW ALL ${library.length}`}
          </button>
        )}
      </div>

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
          results.slice(0, shown).map((exercise) => (
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
                  {MUSCLE_LABEL[exercise.primary_muscle as Muscle] ?? exercise.primary_muscle} ·{" "}
                  {equipmentLabel(exercise.equipment)}
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
        {results.length > shown ? (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="hit rounded-[11px] border border-line py-2.5 font-mono text-[10.5px] font-semibold text-fg-soft hover:border-stroke hover:text-fg"
          >
            SHOW {Math.min(PAGE, results.length - shown)} MORE · {results.length - shown} LEFT
          </button>
        ) : null}
      </div>
    </Card>
  );
}
