"use client";

import { useState } from "react";
import { setBodyFigure } from "@/app/actions/body";
import type { BodyFigure } from "@/lib/database.types";
import {
  LOAD_WINDOWS,
  MUSCLES,
  MUSCLE_LABEL,
  peakLoad,
  untrainedMuscles,
  type LoadWindow,
  type MuscleLoad,
} from "@/lib/training/muscle-load";
import { trimNumber } from "@/lib/units";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Card } from "@/components/kit/card";
import { MuscleMap, muscleFill } from "./muscle-map";
import { Segmented } from "./segmented";

type Mode = "all" | "hard";

const MODES: readonly { key: Mode; label: string }[] = [
  { key: "all", label: "All sets" },
  { key: "hard", label: "Hard sets" },
];

const FIGURES: readonly { key: BodyFigure; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
];

const MISSING_LEAD: Record<LoadWindow, string> = {
  week: "Not trained this week",
  "30d": "Not trained in 30 days",
  all: "Never trained",
};

export type MuscleLoads = Record<LoadWindow, Record<Mode, MuscleLoad>>;

export function MuscleMapCard({
  loads,
  figure: initialFigure,
  rated,
}: {
  loads: MuscleLoads;
  figure: BodyFigure;
  /** Some sets carry an effort rating, so a hard-sets view means something. */
  rated: boolean;
}) {
  // Open on the shortest window that has anything in it: on a Monday morning
  // "this week" is blank, and a blank body says nothing.
  const [span, setSpan] = useState<LoadWindow>(
    () => LOAD_WINDOWS.find((w) => peakLoad(loads[w.key].all) > 0)?.key ?? "week",
  );
  const [mode, setMode] = useState<Mode>("all");
  const [figure, setFigure] = useState(initialFigure);
  const figureSave = useAction();

  const load = loads[span][rated ? mode : "all"];
  const peak = peakLoad(load);
  const busiest = MUSCLES.filter((m) => load[m] === peak && peak > 0);
  const missing = untrainedMuscles(load);
  const everTrained = peakLoad(loads.all.all) > 0;

  return (
    <Card className="rounded-[18px]">
      <h2 className="text-[15px] font-bold">Muscle map</h2>
      <p className="mt-1 mb-3.5 font-mono text-[10.5px] text-fg-dim uppercase">
        Sets per muscle · secondary counts half
      </p>

      <div className="flex flex-wrap gap-2">
        <Segmented label="Window" options={LOAD_WINDOWS} value={span} onChange={setSpan} />
        {rated ? <Segmented label="Sets" options={MODES} value={mode} onChange={setMode} /> : null}
      </div>

      <MuscleMap load={load} figure={figure} className="mt-4" />

      {peak > 0 ? (
        <div className="mt-3.5 flex items-center gap-2 font-mono text-[10px] text-fg-dim uppercase">
          <span>Less</span>
          <span
            aria-hidden
            className="h-1.5 flex-1 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${muscleFill(0.01, 1)}, ${muscleFill(1, 1)})`,
            }}
          />
          <span>More</span>
        </div>
      ) : null}

      <div className="mt-3 text-[12.5px] leading-[1.55]">
        {!everTrained ? (
          <p className="text-fg-dim">
            Log a session and the muscles it worked light up here.
          </p>
        ) : peak === 0 ? (
          <p className="text-fg-dim">
            {mode === "hard" && rated
              ? "No sets rated hard in this window. Rate your sets and the hard ones show here."
              : "Nothing logged in this window yet."}
          </p>
        ) : (
          <>
            <p className="text-fg-soft">
              Most work:{" "}
              <span className="font-semibold text-fg-2">
                {busiest.map((m) => MUSCLE_LABEL[m]).join(", ")}
              </span>{" "}
              · {trimNumber(peak)} {peak === 1 ? "set" : "sets"}
            </p>
            <p className={cn("mt-1", missing.length ? "text-warn" : "text-accent")}>
              {missing.length
                ? `${MISSING_LEAD[span]}: ${missing.map((m) => MUSCLE_LABEL[m]).join(", ")}.`
                : "Every muscle got some work."}
            </p>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-3.5">
        <span className="eyebrow">Figure</span>
        <div className="flex gap-1">
          {FIGURES.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={figure === option.key}
              disabled={figureSave.pending}
              onClick={() => {
                if (option.key === figure) return;
                setFigure(option.key);
                figureSave.run(() => setBodyFigure(option.key));
              }}
              className={cn(
                "hit rounded-md border px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase transition-colors disabled:opacity-60",
                figure === option.key
                  ? "border-line-sel bg-accent-soft text-accent"
                  : "border-line text-fg-dim hover:border-stroke",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
