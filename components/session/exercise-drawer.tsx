"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PersonalBest, SessionExercise } from "@/lib/training/queries";
import type { UnitSystem } from "@/lib/database.types";
import { formatDuration, formatWeight, trimNumber, weightUnit } from "@/lib/units";
import { E1RM_REP_CAP, estimateOneRepMax } from "@/lib/training/e1rm";
import { Portal } from "@/components/kit/portal";

export type DrawerData = {
  exercise: SessionExercise["exercise"];
  plan: SessionExercise["plan"];
  best: PersonalBest | null;
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
  const tracking = exercise.tracking ?? "reps";

  const target = plan
    ? tracking !== "reps" && plan.target_seconds
      ? `${plan.target_sets} × ${tracking === "cardio" ? `${Math.round(plan.target_seconds / 60)} min` : `${plan.target_seconds}s`}`
      : plan.rep_min == null
        ? `${plan.target_sets} sets`
        : `${plan.target_sets} × ${plan.rep_min}${plan.rep_max && plan.rep_max !== plan.rep_min ? `-${plan.rep_max}` : ""}`
    : "—";

  const top = best?.bestSet ?? null;
  const e1rm =
    top?.weight_kg && top.reps ? estimateOneRepMax(Number(top.weight_kg), top.reps) : 0;

  const muscles = [exercise.primary_muscle, ...(exercise.secondary_muscles ?? [])]
    .map((m) => MUSCLE_LABEL[m] ?? m)
    .join(" · ");

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={exercise.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex justify-end bg-[#04050699]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // overscroll-contain: reaching the end of the steps must not start
        // scrolling the session underneath.
        className="h-full w-full max-w-[520px] animate-rise-in overflow-y-auto overscroll-contain border-l border-line bg-sidebar-bg pb-[env(safe-area-inset-bottom)]"
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
            className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-[11px] border border-stroke bg-[#0a0c0dcc] text-fg-muted hover:text-fg lg:top-3.5 lg:right-3.5 lg:size-8 lg:rounded-[9px]"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-5 pt-6 pb-10 sm:px-[26px]">
          <div className="font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
            How to do it
          </div>
          <h2 className="mt-2.5 mb-1.5 text-[26px] leading-[1.15] font-extrabold tracking-[-0.03em]">
            {exercise.name}
          </h2>
          <p className="font-mono text-[11px] text-fg-dim uppercase">{muscles}</p>

          <div className="my-5 flex gap-2.5">
            <Tile label="Today" value={target} />
            {tracking === "time" ? (
              <Tile
                label="Longest hold"
                value={best?.longestS ? formatDuration(best.longestS) : "—"}
              />
            ) : tracking === "reps" ? (
              <>
                <Tile
                  label="Best set"
                  value={top?.weight_kg && top.reps ? `${formatWeight(top.weight_kg, system)} × ${top.reps}` : "—"}
                />
                {/* An estimate names its source: 140 × 1 and 100 × 10 are
                    very different claims about the same number. */}
                <Tile
                  label="Est. 1RM"
                  value={e1rm > 0 ? formatWeight(e1rm, system, 0) : "—"}
                />
              </>
            ) : null}
          </div>

          {tracking === "reps" ? <OneRepMaxCalculator system={system} /> : null}

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
    </Portal>
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

/**
 * "What would this set make my max?" — for a set you have not done yet, or one
 * from another app. Refuses past the rep cap, like every other estimate here.
 */
function OneRepMaxCalculator({ system }: { system: UnitSystem }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const unit = weightUnit(system);
  const w = Number(weight.replace(",", "."));
  const r = Math.round(Number(reps));
  const tooMany = r > E1RM_REP_CAP;
  // Display units in, display units out: Epley is linear in the load.
  const estimate = w > 0 && r > 0 ? estimateOneRepMax(w, r) : 0;

  const field =
    "w-full min-w-0 rounded-[10px] border border-line bg-surface px-3 py-2.5 font-mono text-base outline-none focus:border-line-hi sm:text-[13px]";

  return (
    <div className="mb-6 rounded-[14px] border border-line bg-surface p-4">
      <div className="eyebrow mb-3">1RM calculator</div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] text-fg-dim uppercase">{unit}</span>
          <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="100" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] text-fg-dim uppercase">Reps</span>
          <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="5" className={field} />
        </label>
      </div>
      <p className="mt-3 text-[12.5px] leading-[1.5] text-fg-muted">
        {tooMany
          ? `Past ${E1RM_REP_CAP} reps an estimate says more about endurance than strength — no guess.`
          : estimate > 0
            ? (
                <>
                  Estimated max{" "}
                  <span className="font-mono font-bold text-accent">
                    {trimNumber(estimate, 1)} {unit}
                  </span>
                  {" · "}
                  {[90, 80, 70]
                    .map((pct) => `${pct}% ${trimNumber((estimate * pct) / 100, 1)}`)
                    .join(" · ")}
                </>
              )
            : "Type a weight and the reps you got (or think you would)."}
      </p>
    </div>
  );
}
