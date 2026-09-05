"use client";

import { useActionState, useState } from "react";
import { saveMetrics, type ActionState } from "@/app/actions/body";
import { MEASURE_FIELDS, delta, latest, type Metric } from "@/lib/body/stats";
import type { UnitSystem } from "@/lib/database.types";
import {
  cmToDisplay,
  kgToDisplay,
  lengthUnit,
  trimNumber,
  weightUnit,
} from "@/lib/units";
import { toDateString } from "@/lib/dates";
import { Card } from "@/components/kit/card";
import { cn } from "@/lib/utils";

const FIELD_INPUTS = [
  { name: "weightKg", label: "Weight", kind: "weight" as const },
  { name: "waistCm", label: "Waist", kind: "length" as const },
  { name: "chestCm", label: "Chest", kind: "length" as const },
  { name: "armCm", label: "Arm", kind: "length" as const },
  { name: "thighCm", label: "Thigh", kind: "length" as const },
  { name: "hipCm", label: "Hip", kind: "length" as const },
  { name: "bodyfatPct", label: "Body fat %", kind: "raw" as const },
];

export function MeasurementsPanel({
  metrics,
  system,
}: {
  metrics: Metric[];
  system: UnitSystem;
}) {
  const [state, save] = useActionState(saveMetrics, {} as ActionState);
  const [open, setOpen] = useState(metrics.length === 0);

  function display(value: number, unit: "kg" | "cm" | "%") {
    if (unit === "kg") return trimNumber(kgToDisplay(value, system));
    if (unit === "cm") return trimNumber(cmToDisplay(value, system));
    return trimNumber(value);
  }

  function unitLabel(unit: "kg" | "cm" | "%") {
    if (unit === "kg") return weightUnit(system);
    if (unit === "cm") return lengthUnit(system);
    return "%";
  }

  return (
    <Card className="rounded-[18px]">
      <h2 className="mb-3.5 text-[15px] font-bold">Measurements</h2>

      {metrics.length === 0 ? (
        <p className="mb-4 text-[13px] leading-[1.55] text-fg-dim">
          Nothing logged yet. One weigh-in is a data point; a few weeks is a trend.
        </p>
      ) : (
        <div className="flex flex-col">
          {MEASURE_FIELDS.map((field) => {
            const now = latest(metrics, field.key);
            const change = delta(metrics, field.key);
            if (!now) return null;
            // On a cut, down is good for weight and waist; up is good for arms.
            const good =
              change == null
                ? null
                : field.key === "weight_kg" || field.key === "waist_cm" || field.key === "bodyfat_pct"
                  ? change < 0
                  : change > 0;
            return (
              <div
                key={field.key}
                className="flex items-center gap-2.5 border-b border-[#171b1d] py-[11px] last:border-0"
              >
                <span className="flex-1 text-[13px] font-semibold text-fg-2">
                  {field.label}
                </span>
                <span className="font-mono text-[13px] font-semibold">
                  {display(now.value, field.unit)}
                  <span className="ml-1 text-[10px] text-fg-dim">
                    {unitLabel(field.unit)}
                  </span>
                </span>
                <span
                  className={cn(
                    "w-[52px] text-right font-mono text-[11px] font-semibold",
                    change == null ? "text-fg-dim" : good ? "text-accent" : "text-warn",
                  )}
                >
                  {change == null
                    ? "—"
                    : `${change > 0 ? "+" : ""}${display(change, field.unit)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3.5 w-full rounded-[11px] border border-dashed border-stroke px-3 py-[11px] text-center text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-accent hover:text-accent"
      >
        {open ? "Close" : "+ Log measurements"}
      </button>

      {open ? (
        <form action={save} className="mt-3.5 flex flex-col gap-2.5">
          <input type="hidden" name="measuredOn" value={toDateString(new Date())} />
          <div className="grid grid-cols-2 gap-2.5">
            {FIELD_INPUTS.map((f) => (
              <label key={f.name} className="block">
                <span className="eyebrow mb-1.5 block">
                  {f.label}
                  {f.kind !== "raw" ? (
                    <span className="ml-1 text-fg-faint">
                      {f.kind === "weight" ? weightUnit(system) : lengthUnit(system)}
                    </span>
                  ) : null}
                </span>
                <input
                  name={f.name}
                  inputMode="decimal"
                  placeholder="—"
                  className="w-full rounded-[9px] border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] text-fg-2 outline-none placeholder:text-fg-dim focus:border-line-hi"
                />
              </label>
            ))}
          </div>
          {state.error ? (
            <p className="rounded-[9px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
              {state.error}
            </p>
          ) : null}
          {state.notice ? (
            <p className="rounded-[9px] border border-line-hi bg-accent-soft px-3 py-2 text-xs text-accent">
              {state.notice}
            </p>
          ) : null}
          <button
            type="submit"
            className="rounded-[11px] bg-accent px-4 py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Save today&apos;s numbers
          </button>
          <p className="text-[11px] text-fg-dim">
            Values are stored in {weightUnit(system) === "kg" ? "kg and cm" : "kg and cm after converting from lb and in"}.
            Logging twice in a day corrects the entry rather than adding another.
          </p>
        </form>
      ) : null}
    </Card>
  );
}
