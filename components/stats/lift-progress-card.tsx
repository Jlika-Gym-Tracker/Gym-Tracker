"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import type { UnitSystem } from "@/lib/database.types";
import { EFFORT_LABEL, rirOf, toScale } from "@/lib/training/effort";
import type { LiftSeries } from "@/lib/training/lift-progress";
import { kgToDisplay, trimNumber, weightUnit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { Card } from "@/components/kit/card";
import { MarkedLineChart } from "@/components/charts/line-chart";
import { limeRamp } from "./ramp";

/**
 * A dot's shade from the effort of the set behind it: brightest at failure,
 * fading to accent-deep at five or more in reserve. Null draws it hollow.
 */
function effortShade(rpe: number | null): string | null {
  const rir = rirOf(rpe);
  return rir == null ? null : limeRamp(1 - rir / 5);
}

export function LiftProgressCard({
  lifts,
  system,
  effortScale,
}: {
  /** Most-trained first; the first one is shown until another is picked. */
  lifts: LiftSeries[];
  system: UnitSystem;
  /** How to name a set's effort in the tooltip; null when nothing is rated. */
  effortScale: "rpe" | "rir" | null;
}) {
  const [exerciseId, setExerciseId] = useState(lifts[0]?.exerciseId ?? "");
  const lift = lifts.find((l) => l.exerciseId === exerciseId) ?? lifts[0];
  const unit = weightUnit(system);
  const show = (kg: number) => trimNumber(kgToDisplay(kg, system));

  if (!lift) {
    return (
      <Card className="rounded-[18px]">
        <h2 className="text-[15px] font-bold">Lift progress</h2>
        <p className="py-8 text-center text-[13px] leading-[1.55] text-fg-dim">
          Log a set with weight and reps and its estimated max starts a line here.
        </p>
      </Card>
    );
  }

  const points = lift.points.map((p) => ({
    label: format(parseISO(p.date), "MMM dd"),
    e1rm: Number(kgToDisplay(p.e1rmKg, system).toFixed(1)),
    e1rmKg: p.e1rmKg,
    weightKg: p.weightKg,
    reps: p.reps,
    rpe: p.rpe,
  }));
  const first = lift.points[0]!;
  const last = lift.points[lift.points.length - 1]!;
  const change = last.e1rmKg - first.e1rmKg;
  const values = points.map((p) => p.e1rm);
  const pad = Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.15);
  const domain: [number, number] = [
    Math.max(0, Math.floor(Math.min(...values) - pad)),
    Math.ceil(Math.max(...values) + pad),
  ];
  const rated = lift.points.some((p) => p.rpe != null);

  return (
    <Card className="rounded-[18px]">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2.5">
        <div className="mr-auto">
          <h2 className="text-[15px] font-bold">Lift progress</h2>
          <p className="mt-1 font-mono text-[10.5px] text-fg-dim uppercase">
            Est. 1RM · best set each session
          </p>
        </div>
        <label className="w-full sm:w-auto">
          <span className="sr-only">Exercise</span>
          <select
            value={lift.exerciseId}
            onChange={(event) => setExerciseId(event.target.value)}
            className="w-full rounded-[11px] border border-line bg-surface-2 px-3 py-2 text-[13px] text-fg-2 outline-none focus:border-line-hi sm:max-w-[260px]"
          >
            {lifts.map((l) => (
              <option key={l.exerciseId} value={l.exerciseId}>
                {l.name} · {l.sessions} {l.sessions === 1 ? "session" : "sessions"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="font-mono text-[26px] leading-none font-extrabold tracking-[-0.03em]">
          {show(last.e1rmKg)}
        </span>
        <span className="text-xs text-fg-soft">{unit}</span>
        {lift.points.length >= 2 ? (
          <span
            className={cn(
              "ml-2 text-[11.5px] font-semibold",
              change > 0 ? "text-accent" : change < 0 ? "text-warn" : "text-fg-dim",
            )}
          >
            {change > 0 ? "+" : ""}
            {show(change)} {unit} since{" "}
            {format(
              parseISO(first.date),
              first.date.slice(0, 4) === last.date.slice(0, 4) ? "MMM d" : "MMM d, yyyy",
            )}
          </span>
        ) : null}
      </div>

      {points.length >= 2 ? (
        <div className="mt-3">
          <MarkedLineChart
            data={points}
            dataKey="e1rm"
            height={160}
            domain={domain}
            describe={(p) => {
              const effort = effortScale ? toScale(p.rpe, effortScale) : null;
              return [
                `est. ${show(p.e1rmKg)} ${unit} from ${show(p.weightKg)} × ${p.reps}`,
                ...(effort != null && effortScale ? [`${EFFORT_LABEL[effortScale]} ${trimNumber(effort)}`] : []),
              ];
            }}
            markFill={(p) => effortShade(p.rpe)}
          />
          {rated ? (
            <p className="mt-2 text-[11.5px] text-fg-dim">
              Brighter dots were closer to failure. Hollow ones were not rated.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="py-6 text-center text-[13px] leading-[1.55] text-fg-dim">
          One session of {lift.name} so far. Log it again to draw a line.
        </p>
      )}
    </Card>
  );
}
