import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTodayOverview } from "@/lib/dashboard/queries";
import { formatVolume, weightUnit } from "@/lib/units";
import type { UnitSystem } from "@/lib/database.types";
import { Card, Eyebrow, StatCard } from "@/components/kit/card";
import { EmptyState } from "@/components/kit/empty-state";
import { SessionHero } from "@/components/today/session-hero";
import { WeekStrip } from "@/components/today/week-strip";

export default async function TodayPage() {
  const supabase = await createClient();
  const [{ data: profile }, overview] = await Promise.all([
    supabase.from("profiles").select("unit_system").maybeSingle(),
    getTodayOverview(),
  ]);

  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const unit = weightUnit(system);

  // No week written yet — the whole screen is one call to action.
  if (!overview.weekLabel) {
    return (
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <EmptyState
            eyebrow="No week published"
            title="Write your first week."
            body="You write the program — every week. Paste it as text, build it by hand, or start blank and fill it in at the gym."
            action={{ href: "/program", label: "Open program builder" }}
            watermark="WEEK 1"
          />
        </div>
        <SidePanels />
      </div>
    );
  }

  const volumeDelta =
    overview.volumeLastWeekKg > 0
      ? Math.round(
          ((overview.volumeThisWeekKg - overview.volumeLastWeekKg) /
            overview.volumeLastWeekKg) *
            100,
        )
      : null;

  return (
    <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
      <div className="flex min-w-0 flex-col gap-[18px]">
        <SessionHero overview={overview} />

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Sessions"
            value={String(overview.sessionsThisWeek)}
            unit={`/ ${overview.plannedThisWeek} this week`}
            delta={
              overview.sessionsThisWeek >= overview.plannedThisWeek &&
              overview.plannedThisWeek > 0
                ? "Week complete"
                : "On plan"
            }
            tone={
              overview.sessionsThisWeek >= overview.plannedThisWeek &&
              overview.plannedThisWeek > 0
                ? "accent"
                : "dim"
            }
          />
          <StatCard
            label="Volume"
            value={
              overview.volumeThisWeekKg > 0
                ? formatVolume(overview.volumeThisWeekKg, system)
                : "—"
            }
            unit={unit}
            delta={
              volumeDelta == null
                ? "No comparison yet"
                : `${volumeDelta >= 0 ? "+" : ""}${volumeDelta}% vs last week`
            }
            tone={volumeDelta != null && volumeDelta >= 0 ? "accent" : "warn"}
          />
          <StatCard
            label="Avg deficit"
            value="—"
            unit="kcal / day"
            delta="Nutrition lands in phase 5"
          />
          <StatCard label="Weight" value="—" unit={unit} delta="Log your first weigh-in" />
        </div>

        <Card className="flex flex-col gap-3.5">
          <div className="flex items-center">
            <Eyebrow>This week</Eyebrow>
            <Link
              href="/program"
              className="ml-auto font-mono text-[10px] font-semibold text-accent uppercase hover:text-accent-hi"
            >
              Edit week →
            </Link>
          </div>
          <WeekStrip days={overview.strip} />
        </Card>

        <Card className="flex min-h-[200px] flex-col">
          <Eyebrow>Weight trend</Eyebrow>
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-[280px] text-center text-[13px] leading-[1.55] text-fg-dim">
              Twelve weeks of weigh-ins draw a line here. Nothing to plot yet.
            </p>
          </div>
        </Card>
      </div>

      <SidePanels />
    </div>
  );
}

function SidePanels() {
  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex min-h-[200px] flex-col">
        <Eyebrow>Fuel today</Eyebrow>
        <div className="flex flex-1 items-center justify-center">
          <p className="max-w-[240px] text-center text-[13px] leading-[1.55] text-fg-dim">
            Calorie and macro targets appear once your body details are in.
          </p>
        </div>
      </Card>
      <Card className="flex min-h-[200px] flex-col">
        <Eyebrow>Progress photos</Eyebrow>
        <div className="flex flex-1 items-center justify-center">
          <p className="max-w-[240px] text-center text-[13px] leading-[1.55] text-fg-dim">
            Your first photo pair shows up here. Private to your account.
          </p>
        </div>
      </Card>
    </div>
  );
}
