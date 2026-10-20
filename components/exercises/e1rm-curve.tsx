"use client";

import { format, parseISO } from "date-fns";
import type { UnitSystem } from "@/lib/database.types";
import { EFFORT_LABEL, rirOf, toScale } from "@/lib/training/effort";
import type { LiftPoint } from "@/lib/training/lift-progress";
import { kgToDisplay, trimNumber, weightUnit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { MarkedLineChart } from "@/components/charts/line-chart";
import { accentRamp } from "@/components/stats/ramp";

/**
 * One movement's estimated-1RM line: the best set of each session, drawn the
 * way Progress draws it — brighter dots closer to failure, hollow if unrated.
 */
export function E1rmCurve({
  points,
  system,
  effortScale,
}: {
  /** Oldest first, as liftSeries returns them. */
  points: LiftPoint[];
  system: UnitSystem;
  /** How to name a set's effort in the tooltip; null when nothing is rated. */
  effortScale: "rpe" | "rir" | null;
}) {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;

  const unit = weightUnit(system);
  const show = (kg: number) => trimNumber(kgToDisplay(kg, system));
  const data = points.map((p) => ({
    label: format(parseISO(p.date), "MMM dd"),
    e1rm: Number(kgToDisplay(p.e1rmKg, system).toFixed(1)),
    e1rmKg: p.e1rmKg,
    weightKg: p.weightKg,
    reps: p.reps,
    rpe: p.rpe,
  }));
  const values = data.map((p) => p.e1rm);
  const pad = Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.15);
  const domain: [number, number] = [
    Math.max(0, Math.floor(Math.min(...values) - pad)),
    Math.ceil(Math.max(...values) + pad),
  ];
  const change = last.e1rmKg - first.e1rmKg;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className="eyebrow mr-1.5">Est. 1RM</span>
        <span className="font-mono text-[22px] leading-none font-extrabold tracking-[-0.03em]">
          {show(last.e1rmKg)}
        </span>
        <span className="text-xs text-fg-soft">{unit}</span>
        {points.length >= 2 ? (
          <span
            className={cn(
              "ml-1.5 text-[11.5px] font-semibold",
              change > 0 ? "text-accent" : change < 0 ? "text-warn" : "text-fg-dim",
            )}
          >
            {change > 0 ? "+" : ""}
            {show(change)} {unit} since {format(parseISO(first.date), "MMM d, yyyy")}
          </span>
        ) : null}
      </div>
      {points.length >= 2 ? (
        <div className="mt-3">
          <MarkedLineChart
            data={data}
            dataKey="e1rm"
            height={150}
            domain={domain}
            describe={(p) => {
              const effort = effortScale ? toScale(p.rpe, effortScale) : null;
              return [
                `est. ${show(p.e1rmKg)} ${unit} from ${show(p.weightKg)} × ${p.reps}`,
                ...(effort != null && effortScale ? [`${EFFORT_LABEL[effortScale]} ${trimNumber(effort)}`] : []),
              ];
            }}
            markFill={(p) => {
              const rir = rirOf(p.rpe);
              return rir == null ? null : accentRamp(1 - rir / 5);
            }}
          />
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-fg-dim">One session so far. Log it again to draw a line.</p>
      )}
    </div>
  );
}
