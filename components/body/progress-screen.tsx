"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import type { PhotoWithUrl } from "@/lib/body/queries";
import type { Metric } from "@/lib/body/stats";
import { delta } from "@/lib/body/stats";
import type { Pose, UnitSystem } from "@/lib/database.types";
import { cmToDisplay, kgToDisplay, lengthUnit, trimNumber, weightUnit } from "@/lib/units";
import { Card, Eyebrow } from "@/components/kit/card";
import { ChartLegend, DualLineChart, TrendChart } from "@/components/charts/line-chart";
import { cn } from "@/lib/utils";
import { CompareSlider } from "./compare-slider";
import { PhotoTimeline } from "./photo-timeline";
import { PhotoUpload } from "./photo-upload";
import { MeasurementsPanel } from "./measurements-panel";

const POSES: Pose[] = ["front", "side", "back"];

export function ProgressScreen({
  metrics,
  photosByPose,
  system,
  strengthSeries,
  strengthDeltaPct,
}: {
  metrics: Metric[];
  photosByPose: Record<Pose, PhotoWithUrl[]>;
  system: UnitSystem;
  strengthSeries: { label: string; strength: number | null; bodyweight: number | null }[];
  strengthDeltaPct: number | null;
}) {
  const [pose, setPose] = useState<Pose>("front");
  const photos = photosByPose[pose] ?? [];
  const sorted = [...photos].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  const before = sorted[0];
  const after = sorted[sorted.length - 1];

  const weightTrend = [...metrics]
    .filter((m) => m.weight_kg != null)
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on))
    .map((m) => ({
      label: format(parseISO(m.measured_on), "MMM dd"),
      weight: Number(kgToDisplay(Number(m.weight_kg), system).toFixed(1)),
    }));

  const tiles = [
    { label: "Weight", value: delta(metrics, "weight_kg"), unit: "kg" as const, downIsGood: true },
    { label: "Waist", value: delta(metrics, "waist_cm"), unit: "cm" as const, downIsGood: true },
    { label: "Arm", value: delta(metrics, "arm_cm"), unit: "cm" as const, downIsGood: false },
  ];

  return (
    <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_348px]">
      <div className="flex min-w-0 flex-col gap-[18px]">
        <Card className="rounded-[18px]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-[15px] font-bold">Photo comparison</h2>
            <span className="font-mono text-[11px] text-fg-dim uppercase">
              {photos.length} {pose} {photos.length === 1 ? "photo" : "photos"}
            </span>
            <div className="ml-auto flex gap-1 rounded-[9px] border border-line bg-surface-2 p-[3px]">
              {POSES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPose(p)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase transition-colors",
                    pose === p ? "bg-accent text-[#0a0c0d]" : "text-fg-soft hover:text-fg",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {before && after && before.id !== after.id ? (
            <CompareSlider before={before} after={after} />
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-stroke px-6 text-center">
              <p className="max-w-[320px] text-[13px] leading-[1.55] text-fg-dim">
                {photos.length === 0
                  ? `No ${pose} photos yet. Add one now and another in a few weeks — the slider needs two to compare.`
                  : "One photo so far. Add a second and the comparison slider appears here."}
              </p>
              <div className="w-[240px]">
                <PhotoUpload pose={pose} />
              </div>
            </div>
          )}

          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-line bg-surface-2 px-3.5 py-3"
              >
                <div className="eyebrow">{tile.label}</div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "text-xl font-extrabold tracking-[-0.03em]",
                      tile.value == null
                        ? "text-fg-dim"
                        : tile.downIsGood === tile.value < 0
                          ? "text-accent"
                          : "text-warn",
                    )}
                  >
                    {tile.value == null
                      ? "—"
                      : `${tile.value > 0 ? "+" : ""}${trimNumber(
                          tile.unit === "kg"
                            ? kgToDisplay(tile.value, system)
                            : cmToDisplay(tile.value, system),
                        )}`}
                  </span>
                  <span className="text-[11px] text-fg-soft">
                    {tile.unit === "kg" ? weightUnit(system) : lengthUnit(system)}
                  </span>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <div className="eyebrow">Strength</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-xl font-extrabold tracking-[-0.03em]",
                    strengthDeltaPct == null
                      ? "text-fg-dim"
                      : strengthDeltaPct >= 0
                        ? "text-accent"
                        : "text-warn",
                  )}
                >
                  {strengthDeltaPct == null
                    ? "—"
                    : `${strengthDeltaPct > 0 ? "+" : ""}${Math.round(strengthDeltaPct)}%`}
                </span>
                <span className="text-[11px] text-fg-soft">est. 1RM</span>
              </div>
            </div>
          </div>

          {photos.length > 0 ? (
            <div className="mt-4">
              <PhotoTimeline photos={sorted} />
              <div className="mt-3.5 max-w-[280px]">
                <PhotoUpload pose={pose} />
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="rounded-[18px]">
          <Eyebrow>Weight trend</Eyebrow>
          {weightTrend.length >= 2 ? (
            <div className="mt-3">
              <TrendChart data={weightTrend} dataKey="weight" unit={weightUnit(system)} />
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-fg-dim">
              Two weigh-ins draw a line. You have {weightTrend.length}.
            </p>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-[18px]">
        <MeasurementsPanel metrics={metrics} system={system} />

        <Card className="rounded-[18px]">
          <h2 className="text-[15px] font-bold">Strength vs bodyweight</h2>
          <p className="mt-1 mb-3.5 font-mono text-[10.5px] text-fg-dim uppercase">
            Keeping muscle while cutting
          </p>
          {strengthSeries.length >= 2 ? (
            <>
              <DualLineChart
                data={strengthSeries}
                height={130}
                series={[
                  { key: "strength", color: "#c9f24d", name: "Est. 1RM avg" },
                  { key: "bodyweight", color: "#4a5560", dashed: true, name: "Bodyweight" },
                ]}
              />
              <ChartLegend
                items={[
                  { name: "Est. 1RM avg", color: "#c9f24d" },
                  { name: "Bodyweight", color: "#4a5560" },
                ]}
              />
            </>
          ) : (
            <p className="py-8 text-center text-[13px] leading-[1.55] text-fg-dim">
              Both lines are indexed to 100 at the start. Log a few weeks of sets and
              weigh-ins to see whether strength holds while weight falls.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
