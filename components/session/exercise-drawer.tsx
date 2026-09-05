"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { SessionExercise } from "@/lib/training/queries";
import type { UnitSystem } from "@/lib/database.types";
import { formatWeight } from "@/lib/units";
import { estimateOneRepMax } from "@/lib/training/e1rm";

export type DrawerData = {
  exercise: SessionExercise["exercise"];
  plan: SessionExercise["plan"];
  best: { weight_kg: number | null; reps: number | null } | null;
};

const MUSCLE_LABEL: Record<string, string> = {
  chest: "Chest", lats: "Lats", middle_back: "Mid back", lower_back: "Lower back",
  traps: "Traps", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", quadriceps: "Quads", hamstrings: "Hamstrings",
  glutes: "Glutes", calves: "Calves", abdominals: "Core",
  abductors: "Abductors", adductors: "Adductors", neck: "Neck",
};

/** The right-hand drawer opened by any "HOW TO →". */
export function ExerciseDrawer({
  data,
  system,
  onClose,
}: {
  data: DrawerData | null;
  system: UnitSystem;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [data, onClose]);

  if (!data) return null;
  const { exercise, plan, best } = data;

  const target = plan
    ? plan.rep_min == null
      ? `${plan.target_sets} sets`
      : `${plan.target_sets} × ${plan.rep_min}${plan.rep_max && plan.rep_max !== plan.rep_min ? `-${plan.rep_max}` : ""}`
    : "—";

  const e1rm =
    best?.weight_kg && best.reps
      ? estimateOneRepMax(Number(best.weight_kg), best.reps)
      : null;

  const muscles = [exercise.primary_muscle, ...(exercise.secondary_muscles ?? [])]
    .map((m) => MUSCLE_LABEL[m] ?? m)
    .join(" · ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={exercise.name}
      onClick={onClose}
      className="fixed inset-0 z-40 flex justify-end bg-[#04050699]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[520px] animate-rise-in overflow-y-auto border-l border-line bg-sidebar-bg"
      >
        <div className="relative aspect-[16/10] bg-surface-2">
          {exercise.image_start_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exercise.image_end_url ?? exercise.image_start_url}
              alt={exercise.name}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-mono text-xs text-fg-dim">
              NO DEMO IMAGE
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-[9px] border border-stroke bg-[#0a0c0dcc] text-fg-muted hover:text-fg"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-[26px] pt-6 pb-10">
          <div className="font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
            How to do it
          </div>
          <h2 className="mt-2.5 mb-1.5 text-[26px] leading-[1.15] font-extrabold tracking-[-0.03em]">
            {exercise.name}
          </h2>
          <p className="font-mono text-[11px] text-fg-dim uppercase">{muscles}</p>

          <div className="my-5 flex gap-2.5">
            <Tile label="Today" value={target} />
            <Tile
              label="Best set"
              value={
                best?.weight_kg && best.reps
                  ? `${formatWeight(best.weight_kg, system)} × ${best.reps}`
                  : "—"
              }
            />
            <Tile
              label="Est. 1RM"
              value={e1rm ? formatWeight(e1rm, system, 0) : "—"}
            />
          </div>

          {exercise.how_to?.length ? (
            <>
              <div className="eyebrow mb-3">How to do it</div>
              <ol className="flex flex-col gap-3">
                {exercise.how_to.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex size-[26px] flex-none items-center justify-center rounded-lg border border-line-hi bg-accent-soft font-mono text-[11px] font-bold text-accent">
                      {i + 1}
                    </span>
                    <span className="text-[13px] leading-[1.6] text-[#c2ccc6]">{step}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {exercise.image_start_url && exercise.image_end_url ? (
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              {[
                ["Start", exercise.image_start_url],
                ["End", exercise.image_end_url],
              ].map(([label, src]) => (
                <figure key={label} className="overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src!} alt={`${exercise.name} — ${label}`} className="aspect-square w-full object-cover" />
                  <figcaption className="eyebrow px-3 py-2">{label} position</figcaption>
                </figure>
              ))}
            </div>
          ) : null}

          {exercise.cues?.length ? (
            <div className="mt-6">
              <div className="eyebrow mb-3">Cues</div>
              <ul className="flex flex-col gap-2.5">
                {exercise.cues.map((cue, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-[7px] size-[6px] flex-none rounded-[2px] bg-accent" />
                    <span className="text-[12.5px] leading-[1.5] text-fg-muted">{cue}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {exercise.common_mistake ? (
            <div className="mt-6 rounded-[14px] border border-line-hi bg-accent-soft px-[18px] py-4">
              <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">
                Common mistake
              </div>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#dfe7d5]">
                {exercise.common_mistake}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl border border-line bg-surface p-3.5">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 font-mono text-base font-extrabold">{value}</div>
    </div>
  );
}
