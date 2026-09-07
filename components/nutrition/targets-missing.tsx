"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveMetrics } from "@/app/actions/body";
import type { ActionState } from "@/app/actions/body";
import type { MissingTargetInput } from "@/lib/nutrition/queries";
import type { UnitSystem } from "@/lib/database.types";
import { toDateString } from "@/lib/dates";
import { weightUnit } from "@/lib/units";
import { Card } from "@/components/kit/card";

const LABELS: Record<MissingTargetInput, string> = {
  sex: "sex",
  birth_date: "birth date",
  height: "height",
  weight: "a current bodyweight",
};

function list(items: string[]) {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Names exactly what the calorie formula is waiting on.
 *
 * When the only gap is a weigh-in, the fix is offered inline — sending someone
 * to another screen to type one number is a poor trade.
 */
export function TargetsMissing({
  missing,
  system,
}: {
  missing: MissingTargetInput[];
  system: UnitSystem;
}) {
  const [state, save] = useActionState(saveMetrics, {} as ActionState);
  const onlyWeight = missing.length === 1 && missing[0] === "weight";

  return (
    <Card className="rounded-[18px]">
      <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
        {onlyWeight ? "One number to go" : "Targets not set"}
      </div>

      <h1 className="display mt-4 mb-2 max-w-[520px] text-[34px]">
        {onlyWeight
          ? "What do you weigh today?"
          : `We still need your ${list(missing.map((m) => LABELS[m]))}.`}
      </h1>

      <p className="max-w-[460px] text-[13.5px] leading-[1.55] text-fg-muted">
        {onlyWeight
          ? "Calories come from Mifflin-St Jeor, which needs a bodyweight. One number and your targets, meal plan and grocery list all appear. It also becomes the first point on your weight trend."
          : "Calorie and macro targets come from your height, birth date, sex and a current bodyweight. Nothing is invented, so nothing shows until those are in."}
      </p>

      {onlyWeight ? (
        <form action={save} className="mt-5 flex flex-wrap items-end gap-2.5">
          <input type="hidden" name="measuredOn" value={toDateString(new Date())} />
          <label className="block">
            <span className="eyebrow mb-1.5 block">
              Weight ({weightUnit(system)})
            </span>
            <input
              name="weightKg"
              inputMode="decimal"
              required
              autoFocus
              placeholder="77.3"
              className="w-[140px] rounded-[11px] border border-line bg-surface-2 px-3.5 py-3 font-mono text-[15px] text-fg-2 outline-none placeholder:text-fg-dim focus:border-line-hi"
            />
          </label>
          <button
            type="submit"
            className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi"
          >
            Save and show my targets
          </button>
          <Link
            href="/progress"
            className="rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-sm font-semibold text-fg-2 transition-colors hover:bg-hover"
          >
            Log measurements too
          </Link>
        </form>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            href="/profile"
            className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Fill in your profile
          </Link>
          {missing.includes("weight") ? (
            <Link
              href="/progress"
              className="rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-sm font-semibold text-fg-2 hover:bg-hover"
            >
              Log a weigh-in
            </Link>
          ) : null}
        </div>
      )}

      {state.error ? (
        <p className="mt-3 w-fit rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </Card>
  );
}
