"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { addExerciseToDay } from "@/app/actions/program";
import type { PlannableWeek } from "@/lib/exercises/queries";
import { useAction } from "@/lib/use-action";
import { Card } from "@/components/kit/card";
import { FIELD } from "./exercise-form";

/**
 * "Add to a day" from an exercise's page: any day of the week under way or
 * one already written after it. It lands with the builder's defaults (3 × 8–12,
 * or a hold or a cardio block for those movements), editable in the builder.
 */
export function AddToDay({ exerciseId, weeks }: { exerciseId: string; weeks: PlannableWeek[] }) {
  const router = useRouter();
  const { pending, run } = useAction();
  // Start on the next day still to come that does not have it yet.
  const days = weeks.flatMap((w) => w.days);
  const firstOpen = (days.find((d) => !d.hasIt && !d.past) ?? days.find((d) => !d.hasIt))?.id ?? "";
  const [dayId, setDayId] = useState(firstOpen);
  const [result, setResult] = useState<{ ok: boolean; text: string; weekStart?: string } | null>(null);

  if (weeks.length === 0) {
    return (
      <Card className="rounded-[18px]">
        <div className="eyebrow">Add to a day</div>
        <p className="mt-2.5 text-[13px] leading-[1.5] text-fg-muted">
          There is no week written for now yet.{" "}
          <Link href="/program" className="font-semibold text-accent hover:text-accent-hi">
            Write this week
          </Link>{" "}
          and it can go straight in.
        </p>
      </Card>
    );
  }

  const chosen = weeks
    .flatMap((w) => w.days.map((d) => ({ ...d, weekStart: w.weekStart })))
    .find((d) => d.id === dayId);

  function add() {
    if (!chosen) return;
    const fd = new FormData();
    fd.set("dayId", chosen.id);
    fd.set("exerciseId", exerciseId);
    fd.set("targetSets", "3");
    fd.set("repMin", "8");
    fd.set("repMax", "12");
    run(async () => {
      const res = await addExerciseToDay({}, fd);
      setResult(
        res.error
          ? { ok: false, text: res.error }
          : { ok: true, text: `Added to ${chosen.label} · ${chosen.name}.`, weekStart: chosen.weekStart },
      );
      if (!res.error) router.refresh();
    });
  }

  return (
    <Card className="rounded-[18px]">
      <div className="eyebrow">Add to a day</div>
      <div className="mt-3 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Day</span>
          <select
            value={dayId}
            onChange={(e) => {
              setDayId(e.target.value);
              setResult(null);
            }}
            className={FIELD}
          >
            <option value="" disabled>
              Pick a day
            </option>
            {weeks.map((week) => (
              <optgroup key={week.weekStart} label={week.label}>
                {week.days.map((day) => (
                  <option key={day.id} value={day.id} disabled={day.hasIt}>
                    {day.label} · {day.isRest ? "Rest" : day.name}
                    {day.hasIt ? " — already in" : day.past ? " — past" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!chosen || chosen.hasIt || pending}
          aria-busy={pending || undefined}
          className="inline-flex flex-none items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[12.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <Plus className="size-3.5" strokeWidth={2.5} aria-hidden />
          )}
          Add
        </button>
      </div>
      {chosen?.isRest && !result ? (
        <p className="mt-2 text-[11.5px] text-fg-dim">Adding to a rest day makes it a training day.</p>
      ) : null}
      {result ? (
        <p role="status" className={result.ok ? "mt-2.5 text-[12.5px] text-fg-muted" : "mt-2.5 text-[12.5px] text-danger"}>
          {result.text}{" "}
          {result.weekStart ? (
            <Link
              href={`/program?week=${result.weekStart}`}
              className="font-semibold text-accent hover:text-accent-hi"
            >
              Open the program
            </Link>
          ) : null}
        </p>
      ) : null}
    </Card>
  );
}
