import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WEEK_STARTS_ON, weekDayNames, type WeekStartDay } from "@/lib/dates";
import type { UnitSystem } from "@/lib/database.types";
import {
  buildMonthGrid,
  durationLabel,
  groupSessions,
  monthLabel,
  monthOf,
  monthTotals,
  readHistoryParams,
  sessionDay,
  shiftMonth,
  type HistoryDay,
  type MonthSet,
} from "@/lib/training/history";
import { getHistoryMonth, getMonthRecordCounts } from "@/lib/training/history-queries";
import { formatVolume, weightUnit } from "@/lib/units";
import { Card, Eyebrow } from "@/components/kit/card";
import { EmptyState } from "@/components/kit/empty-state";
import { NavSpinner } from "@/components/shell/nav-spinner";
import { HistorySelection, MonthCalendar, MonthStep } from "@/components/history/month-view";
import { SessionList } from "@/components/history/session-list";

/**
 * Every finished workout, a month at a time: a calendar of the days trained and
 * the sessions under it. ?month=yyyy-MM picks the month and ?day=yyyy-MM-dd
 * picks a day in it — the Progress heatmap links here that way.
 *
 * One month is read at a time, so years of history cost no more than a few
 * weeks of it.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[]; day?: string | string[] }>;
}) {
  const today = new Date();
  const { month, day } = readHistoryParams(await searchParams, today);
  const supabase = await createClient();
  const [{ data: profile }, { data: settings }, data] = await Promise.all([
    supabase.from("profiles").select("unit_system").maybeSingle(),
    supabase.from("user_settings").select("week_starts_on").maybeSingle(),
    getHistoryMonth(month),
  ]);
  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const weekStartsOn = (settings?.week_starts_on ?? WEEK_STARTS_ON) as WeekStartDay;

  if (data.total === 0) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <EmptyState
          eyebrow="History"
          title="Nothing logged yet."
          body="Finish a session and it lands here, filed under its day. Training somewhere else before this? Profile → Data & privacy brings in a Strong, Hevy or FitNotes export."
          action={{ href: "/session", label: "Start a session" }}
          secondaryAction={{ href: "/profile", label: "Bring your history" }}
          watermark="LOG"
        />
      </div>
    );
  }

  const days = groupSessions(data.sessions, data.sets);
  const totals = monthTotals(days);
  const counts = new Map<string, number>();
  for (const s of data.sessions) {
    const date = sessionDay(s.startedAt);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const weeks = buildMonthGrid({ month, weekStartsOn, counts, today });
  const isCurrent = month === monthOf(today);
  const name = monthLabel(month);

  const summary =
    totals.sessions === 0
      ? "No sessions"
      : [
          `${totals.sessions} ${totals.sessions === 1 ? "session" : "sessions"}`,
          totals.minutes > 0 ? durationLabel(totals.minutes) : null,
          totals.volumeKg > 0 ? `${formatVolume(totals.volumeKg, system)} ${weightUnit(system)}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <HistorySelection key={`${month}:${day ?? ""}`} month={month} initialDay={day}>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-[18px] lg:grid lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start">
        <Card className="p-4 sm:p-5 lg:sticky lg:top-6">
          <div className="flex items-center gap-2">
            <MonthStep href={`/history?month=${shiftMonth(month, -1)}`} direction="prev" label="Previous month" />
            <div className="min-w-0 flex-1 text-center">
              <Eyebrow>History</Eyebrow>
              <h1 className="mt-1 truncate text-[19px] leading-tight font-extrabold tracking-[-0.02em]">{name}</h1>
            </div>
            <MonthStep
              href={isCurrent ? null : `/history?month=${shiftMonth(month, 1)}`}
              direction="next"
              label="Next month"
            />
          </div>
          <p className="mt-2 mb-3.5 text-center font-mono text-[11px] text-fg-dim uppercase">{summary}</p>

          <MonthCalendar weeks={weeks} dayNames={weekDayNames(weekStartsOn)} />

          {!isCurrent ? (
            <div className="mt-3 text-center">
              <Link
                href="/history"
                className="inline-flex min-h-10 items-center gap-1.5 font-mono text-[11px] font-semibold text-accent uppercase hover:text-accent-hi"
              >
                <NavSpinner />
                Back to this month
              </Link>
            </div>
          ) : null}
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          {days.length === 0 ? (
            <QuietMonth name={name} earlier={data.earlier} later={data.later} />
          ) : (
            <Card className="px-2 py-3 sm:px-3">
              <Suspense fallback={<SessionList days={days} system={system} records={null} />}>
                <WithRecords month={month} days={days} sets={data.sets} system={system} />
              </Suspense>
            </Card>
          )}

          {days.length > 0 && data.earlier ? (
            <MonthJump href={`/history?month=${data.earlier}`}>
              Earlier · {monthLabel(data.earlier)}
            </MonthJump>
          ) : null}
        </div>
      </div>
    </HistorySelection>
  );
}

/** The list again once the record counts are in; streamed after the month itself. */
async function WithRecords({
  month,
  days,
  sets,
  system,
}: {
  month: string;
  days: HistoryDay[];
  sets: MonthSet[];
  system: UnitSystem;
}) {
  const records = await getMonthRecordCounts(month, sets);
  return <SessionList days={days} system={system} records={records} />;
}

/** A month with no sessions: say so, and point at the nearest months that have some. */
function QuietMonth({ name, earlier, later }: { name: string; earlier: string | null; later: string | null }) {
  return (
    <Card className="flex flex-col gap-3">
      <Eyebrow>Rest month</Eyebrow>
      <p className="text-[13.5px] leading-[1.55] text-fg-muted">
        Nothing finished in {name}. Rest counts too — or the sessions are filed under another month.
      </p>
      <div className="flex flex-col gap-2">
        {earlier ? (
          <MonthJump href={`/history?month=${earlier}`}>Before this · {monthLabel(earlier)}</MonthJump>
        ) : null}
        {later ? <MonthJump href={`/history?month=${later}`}>After this · {monthLabel(later)}</MonthJump> : null}
      </div>
    </Card>
  );
}

function MonthJump({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-2 rounded-[14px] border border-stroke bg-ghost px-4 text-[13px] font-semibold text-fg-2 transition-colors hover:bg-hover"
    >
      <span className="flex-1">{children}</span>
      <NavSpinner />
      <span aria-hidden className="font-mono text-[11px] text-fg-dim">→</span>
    </Link>
  );
}
