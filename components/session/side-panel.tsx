"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import type { SessionExercise } from "@/lib/training/queries";
import type { UnitSystem } from "@/lib/database.types";
import { formatWeight, weightUnit } from "@/lib/units";
import { Card } from "@/components/kit/card";
import { ExerciseThumb } from "@/components/program/exercise-thumb";

export type SidePanelData = {
  history: { date: string; topWeightKg: number; volumeKg: number }[];
  hint: string;
  bestEver: { weight_kg: number | null; reps: number | null } | null;
};

const MUSCLE_LABEL: Record<string, string> = {
  chest: "Chest", lats: "Lats", middle_back: "Mid back", lower_back: "Lower back",
  traps: "Traps", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", quadriceps: "Quads", hamstrings: "Hamstrings",
  glutes: "Glutes", calves: "Calves", abdominals: "Core",
  abductors: "Abductors", adductors: "Adductors", neck: "Neck",
};

/** Sticky right column: the movement in focus, its cues, history and next step. */
export function SidePanel({
  exercise,
  data,
  system,
  onOpenDrawer,
  onAddExercise,
}: {
  exercise: SessionExercise["exercise"];
  data?: SidePanelData;
  system: UnitSystem;
  onOpenDrawer: () => void;
  onAddExercise: (exerciseId: string) => void;
}) {
  const unit = weightUnit(system);
  const history = data?.history ?? [];
  const peak = Math.max(1, ...history.map((h) => h.topWeightKg));
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="sticky top-5 flex flex-col gap-4">
      <Card className="overflow-hidden rounded-[18px] p-0">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="relative block aspect-[16/10] w-full bg-surface-2"
        >
          {exercise.image_start_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exercise.image_start_url}
              alt={exercise.name}
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center font-mono text-xs text-fg-dim">
              NO DEMO IMAGE
            </span>
          )}
          <span className="absolute top-3 left-3 rounded-[5px] bg-[#0a0c0dcc] px-[7px] py-1 font-mono text-[9.5px] font-bold tracking-[0.1em] text-fg">
            HOW TO →
          </span>
        </button>

        <div className="px-5 py-[18px]">
          <h2 className="text-base font-bold tracking-[-0.01em]">{exercise.name}</h2>
          <p className="mt-1 font-mono text-[10.5px] text-fg-dim uppercase">
            {[exercise.primary_muscle, ...(exercise.secondary_muscles ?? [])]
              .map((m) => MUSCLE_LABEL[m] ?? m)
              .join(" · ")}
          </p>

          {exercise.cues?.length ? (
            <div className="mt-3.5 flex flex-col gap-2.5">
              {exercise.cues.slice(0, 3).map((cue, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-[6px] size-[6px] flex-none rounded-[2px] bg-accent" />
                  <p className="text-[12.5px] leading-[1.5] text-fg-muted">{cue}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 border-t border-[#1a1e20] pt-3.5">
            <div className="eyebrow mb-2.5">Your history</div>
            {history.length === 0 ? (
              <p className="text-xs leading-[1.5] text-fg-dim">
                No completed sets for this movement yet. Today becomes the baseline.
              </p>
            ) : (
              history.map((entry) => (
                <div key={entry.date} className="flex items-center gap-2.5 py-1.5">
                  <span className="w-14 flex-none font-mono text-[11px] text-fg-soft">
                    {format(parseISO(entry.date), "MMM dd")}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full bg-accent-deep"
                      style={{ width: `${Math.round((entry.topWeightKg / peak) * 100)}%` }}
                    />
                  </span>
                  <span className="flex-none font-mono text-[11px] font-semibold text-fg-2">
                    {formatWeight(entry.topWeightKg, system, 0)} {unit}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      {data?.hint ? (
        <div className="rounded-[18px] border border-line-hi bg-accent-soft px-5 py-[18px]">
          <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">
            Progression hint
          </div>
          <p className="mt-2 text-[13px] leading-[1.55] text-[#dfe7d5]">{data.hint}</p>
        </div>
      ) : null}

      <AddExtra open={showAdd} onOpen={() => setShowAdd((v) => !v)} onAdd={onAddExercise} />
    </div>
  );
}

/** Adds an unplanned movement mid-session — the machine was taken, etc. */
function AddExtra({
  open,
  onOpen,
  onAdd,
}: {
  open: boolean;
  onOpen: () => void;
  onAdd: (exerciseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; primary_muscle: string; image_start_url: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);

  async function search(next: string) {
    setQuery(next);
    if (next.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/exercises?q=${encodeURIComponent(next)}`);
      setResults(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-[18px]">
      <button
        type="button"
        onClick={onOpen}
        className="-my-3 flex min-h-11 w-full items-center justify-between py-3 text-left"
      >
        <span className="text-[13px] font-bold">Add something extra</span>
        <span className="font-mono text-[11px] text-fg-dim">{open ? "CLOSE" : "OPEN"}</span>
      </button>

      {open ? (
        <div className="mt-3">
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search movements…"
            aria-label="Search movements to add to this session"
            className="w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-fg-2 outline-none placeholder:text-fg-dim focus:border-line-hi"
          />
          <div className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {loading ? (
              <p className="py-3 text-center text-xs text-fg-dim">Searching…</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onAdd(r.id);
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex items-center gap-2.5 rounded-[10px] border border-[#171b1d] p-1.5 text-left hover:border-line-hi hover:bg-[#15191b]"
                >
                  <ExerciseThumb src={r.image_start_url} muscle={r.primary_muscle} size={28} />
                  <span className="truncate text-[12.5px] font-semibold">{r.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
