import Link from "next/link";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getTodayOverview } from "@/lib/dashboard/queries";
import { getMetrics, getPhotos } from "@/lib/body/queries";
import { delta, latest, type Metric } from "@/lib/body/stats";
import { formatVolume, kgToDisplay, trimNumber, weightUnit } from "@/lib/units";
import type { PhotoWithUrl } from "@/lib/body/queries";
import type { UnitSystem } from "@/lib/database.types";
import { Card, Eyebrow, StatCard } from "@/components/kit/card";
import { EmptyState } from "@/components/kit/empty-state";
import { SessionHero } from "@/components/today/session-hero";
import { WeekStrip } from "@/components/today/week-strip";
import { TrendChart } from "@/components/charts/line-chart";

export default async function TodayPage() {
  const supabase = await createClient();
  const [{ data: profile }, overview, metrics, photos] = await Promise.all([
    supabase.from("profiles").select("unit_system").maybeSingle(),
    getTodayOverview(),
    getMetrics(120),
    getPhotos(undefined, 12),
  ]);

  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const unit = weightUnit(system);
  const currentWeight = latest(metrics, "weight_kg");
  const weightDelta = delta(metrics, "weight_kg");

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
        <SidePanels photos={photos} />
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
          <StatCard
            label="Weight"
            value={
              currentWeight
                ? trimNumber(kgToDisplay(currentWeight.value, system))
                : "—"
            }
            unit={unit}
            delta={
              weightDelta == null
                ? "Log your first weigh-in"
                : `${weightDelta > 0 ? "+" : ""}${trimNumber(kgToDisplay(weightDelta, system))} ${unit} since ${format(parseISO(metrics[metrics.length - 1]!.measured_on), "MMM")}`
            }
            tone={weightDelta != null && weightDelta < 0 ? "accent" : "dim"}
          />
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

        <WeightTrendCard metrics={metrics} system={system} />
      </div>

      <SidePanels photos={photos} />
    </div>
  );
}

function WeightTrendCard({ metrics, system }: { metrics: Metric[]; system: UnitSystem }) {
  const points = [...metrics]
    .filter((m) => m.weight_kg != null)
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on))
    .map((m) => ({
      label: format(parseISO(m.measured_on), "MMM dd"),
      weight: Number(kgToDisplay(Number(m.weight_kg), system).toFixed(1)),
    }));

  return (
    <Card className="flex min-h-[200px] flex-col">
      <div className="flex items-center">
        <Eyebrow>Weight trend</Eyebrow>
        <Link
          href="/progress"
          className="ml-auto font-mono text-[10px] font-semibold text-accent uppercase hover:text-accent-hi"
        >
          Body progress →
        </Link>
      </div>
      {points.length >= 2 ? (
        <div className="mt-3">
          <TrendChart data={points} dataKey="weight" unit={weightUnit(system)} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="max-w-[280px] text-center text-[13px] leading-[1.55] text-fg-dim">
            Twelve weeks of weigh-ins draw a line here. You have {points.length}.
          </p>
        </div>
      )}
    </Card>
  );
}

function SidePanels({ photos }: { photos: PhotoWithUrl[] }) {
  const sorted = [...photos].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  const pair = [sorted[0], sorted[sorted.length - 1]].filter(Boolean) as PhotoWithUrl[];
  const hasPair = pair.length === 2 && pair[0]!.id !== pair[1]!.id;

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
        <div className="flex items-center">
          <Eyebrow>Progress photos</Eyebrow>
          <Link
            href="/progress"
            className="ml-auto font-mono text-[10px] font-semibold text-accent uppercase hover:text-accent-hi"
          >
            Compare →
          </Link>
        </div>
        {hasPair ? (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {pair.map((photo) => (
              <figure key={photo.id} className="overflow-hidden rounded-xl border border-line">
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={`Progress photo from ${photo.taken_on}`}
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : null}
                <figcaption className="eyebrow px-2.5 py-2">
                  {format(parseISO(photo.taken_on), "MMM dd")}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-[240px] text-center text-[13px] leading-[1.55] text-fg-dim">
              Your first photo pair shows up here. Private to your account.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
