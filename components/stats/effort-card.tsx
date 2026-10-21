"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { EFFORT_LABEL, HARD_RIR, MIN_RATED } from "@/lib/training/effort";
import {
  EFFORT_WINDOWS,
  bucketLabel,
  fromRir,
  type EffortSummary,
  type EffortWindow,
} from "@/lib/training/effort-stats";
import { trimNumber } from "@/lib/units";
import { cn } from "@/lib/utils";
import { Card } from "@/components/kit/card";
import { MarkedLineChart } from "@/components/charts/line-chart";
import { Segmented } from "./segmented";

type Scale = "rpe" | "rir";

export function EffortCard({
  scale,
  summaries,
}: {
  /** The scale to read in; the card is not rendered at all without rated sets. */
  scale: Scale;
  summaries: Record<EffortWindow, EffortSummary>;
}) {
  const [span, setSpan] = useState<EffortWindow>("90d");
  const summary = summaries[span];
  const label = EFFORT_LABEL[scale];
  const show = (rir: number) => trimNumber(fromRir(rir, scale));

  const weekly = summary.weekly.map((week) => ({
    label: format(parseISO(week.weekStart), "MMM dd"),
    effort: Number(fromRir(week.averageRir, scale).toFixed(1)),
    rated: week.rated,
  }));
  const values = weekly.map((w) => w.effort);
  // Harder sits higher on both scales: RPE counts up to 10, RIR down to 0, so
  // the RIR axis is flipped.
  const domain: [number, number] =
    scale === "rpe"
      ? [Math.min(6, Math.floor(Math.min(...values, 10))), 10]
      : [0, Math.max(4, Math.ceil(Math.max(...values, 0)))];

  const peak = Math.max(1, ...summary.distribution.map((d) => d.count));

  return (
    <Card className="rounded-[18px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div className="mr-auto">
          <h2 className="text-[15px] font-bold">Effort</h2>
          <p className="mt-1 font-mono text-[10.5px] text-fg-dim uppercase">
            In {label} · hard is {scale === "rpe" ? `RPE ${10 - HARD_RIR}+` : `RIR ${HARD_RIR} or less`}
          </p>
        </div>
        <Segmented label="Window" options={EFFORT_WINDOWS} value={span} onChange={setSpan} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Tile
          label={`Average ${label}`}
          value={summary.averageRir == null ? "—" : show(summary.averageRir)}
        />
        <Tile
          label="Hard sets"
          value={summary.hardShare == null ? "—" : `${Math.round(summary.hardShare * 100)}%`}
        />
      </div>
      <p className="mt-2 text-[12px] text-fg-soft">
        {summary.total === 0
          ? "No sets logged in this window."
          : `${summary.rated} of ${summary.total} ${summary.total === 1 ? "set" : "sets"} rated${
              summary.rated > 0 && summary.rated < MIN_RATED
                ? ` — ${MIN_RATED} make an average`
                : ""
            }.`}
      </p>

      <div className="mt-4">
        <div className="eyebrow mb-2">Weekly average</div>
        {weekly.length >= 2 ? (
          <MarkedLineChart
            data={weekly}
            dataKey="effort"
            height={130}
            domain={domain}
            reversed={scale === "rir"}
            describe={(week) => [
              `${label} ${trimNumber(week.effort)} average`,
              `${week.rated} ${week.rated === 1 ? "set" : "sets"} rated`,
            ]}
          />
        ) : (
          <p className="py-6 text-center text-[12.5px] leading-[1.55] text-fg-dim">
            A week goes on the line once two of its sets are rated. You have{" "}
            {weekly.length === 0 ? "none" : "one"} in this window.
          </p>
        )}
      </div>

      <div className="mt-4">
        <div className="eyebrow mb-2">Spread</div>
        <div className="flex h-[92px] items-end gap-2" role="list" aria-label={`Rated sets by ${label}`}>
          {summary.distribution.map(({ bucket, count }) => (
            <div
              key={bucket}
              role="listitem"
              aria-label={`${label} ${bucketLabel(bucket, scale)}: ${count} ${count === 1 ? "set" : "sets"}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span aria-hidden className="font-mono text-[10px] text-fg-soft">
                {count || ""}
              </span>
              <span
                aria-hidden
                className={cn(
                  "w-full max-w-[38px] rounded-t-[5px]",
                  bucket <= HARD_RIR ? "bg-accent" : "bg-stroke",
                  count === 0 && "bg-line",
                )}
                style={{ height: count === 0 ? 2 : `${Math.max(6, (count / peak) * 56)}px` }}
              />
              <span aria-hidden className="font-mono text-[10px] text-fg-dim">
                {bucketLabel(bucket, scale)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-xl font-extrabold tracking-[-0.03em]",
          value === "—" && "text-fg-dim",
        )}
      >
        {value}
      </div>
    </div>
  );
}
