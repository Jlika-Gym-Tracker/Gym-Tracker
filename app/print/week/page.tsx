import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getWeek } from "@/lib/program/queries";
import { dayDate, weekRangeLabel } from "@/lib/dates";
import { POLICY_NAME, effectivePolicy } from "@/lib/program/policies";
import { kgToDisplay, trimNumber, weightUnit } from "@/lib/units";
import type { UnitSystem } from "@/lib/database.types";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print week · JLIKA Gym" };

/**
 * A week on paper. Lives outside the app shell so nothing but the plan
 * prints, and is drawn dark-on-white because printers skip backgrounds and the
 * app's light-on-dark text would come out faint.
 */
export default async function PrintWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: weekStart } = await searchParams;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) notFound();

  const supabase = await createClient();
  const [week, { data: profile }] = await Promise.all([
    getWeek(weekStart),
    supabase.from("profiles").select("unit_system").maybeSingle(),
  ]);
  if (!week) notFound();
  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const unit = weightUnit(system);
  const training = week.days.filter((d) => d.exercises.length > 0);

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-[#111] print:p-0">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-6 flex items-start gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-[#666] uppercase">
              JLIKA Gym · {weekRangeLabel(week.week_start)}
            </p>
            <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.02em]">{week.label}</h1>
          </div>
          <PrintButton />
        </div>

        {training.length === 0 ? (
          <p className="text-[14px] text-[#555]">This week has no exercises yet.</p>
        ) : (
          training.map((day) => (
            <section key={day.id} className="mb-6 break-inside-avoid">
              <h2 className="flex items-baseline gap-2 border-b-2 border-[#111] pb-1 text-[15px] font-bold">
                {format(dayDate(week.week_start, day.day_index), "EEEE")} · {day.name}
                <span className="ml-auto font-mono text-[10px] font-normal text-[#666] uppercase">
                  {POLICY_NAME[day.progression ?? "double"]}
                </span>
              </h2>
              {day.focus_note ? <p className="mt-1 text-[12px] text-[#555]">{day.focus_note}</p> : null}
              <table className="mt-2 w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="text-left font-mono text-[9.5px] tracking-[0.08em] text-[#666] uppercase">
                    <th className="py-1 pr-2 font-medium">Exercise</th>
                    <th className="py-1 pr-2 font-medium">Target</th>
                    <th className="py-1 pr-2 font-medium">Load</th>
                    <th className="py-1 font-medium">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {day.exercises.map((item) => {
                    const tracking = item.exercise.tracking ?? "reps";
                    const target =
                      tracking === "cardio"
                        ? item.target_seconds ? `${Math.round(item.target_seconds / 60)} min` : "—"
                        : tracking === "time"
                          ? `${item.target_sets} × ${item.target_seconds ?? "—"}s`
                          : item.rep_min == null
                            ? `${item.target_sets} sets`
                            : `${item.target_sets} × ${item.rep_min}${item.rep_max && item.rep_max !== item.rep_min ? `–${item.rep_max}` : ""}${item.per_side ? " /side" : ""}`;
                    const policy = effectivePolicy(item.progression, day.progression, tracking);
                    return (
                      <tr key={item.id} className="border-b border-[#ddd] align-top">
                        <td className="py-1.5 pr-2">
                          <span className="font-semibold">
                            {item.superset_group != null ? `SS${item.superset_group} · ` : ""}
                            {item.exercise.name}
                          </span>
                          {item.note ? <span className="block text-[11px] text-[#666]">{item.note}</span> : null}
                        </td>
                        <td className="py-1.5 pr-2 font-mono">{target}</td>
                        <td className="py-1.5 pr-2 font-mono">
                          {item.target_weight_kg != null
                            ? `${trimNumber(kgToDisplay(Number(item.target_weight_kg), system))} ${unit}`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-[11px] text-[#555]">{POLICY_NAME[policy]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))
        )}
        <p className="mt-8 text-[10px] text-[#888]">
          SS = superset: same number, back to back, rest after the last.
        </p>
      </div>
    </div>
  );
}
