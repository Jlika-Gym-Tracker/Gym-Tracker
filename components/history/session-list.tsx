import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import type { UnitSystem } from "@/lib/database.types";
import { durationLabel, type HistoryDay, type SessionLine } from "@/lib/training/history";
import { formatVolume, weightUnit } from "@/lib/units";
import { NavSpinner } from "@/components/shell/nav-spinner";
import { DayGroup } from "./month-view";

/**
 * The month's sessions, a day at a time. Each row opens the session's summary,
 * where it can be fixed or deleted.
 *
 * `records` is null while the counts are still being worked out — they read
 * far more history than the list does, so the list does not wait for them.
 */
export function SessionList({
  days,
  system,
  records,
}: {
  days: HistoryDay[];
  system: UnitSystem;
  records: Record<string, number> | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {days.map((day) => (
        <DayGroup key={day.date} date={day.date}>
          <h3 className="eyebrow py-1">{format(parseISO(day.date), "EEEE · MMM d")}</h3>
          <ul className="flex flex-col">
            {day.sessions.map((session) => (
              <li key={session.id} className="border-b border-[#1a1e20] last:border-b-0">
                <SessionRow session={session} system={system} records={records?.[session.id] ?? (records ? 0 : null)} />
              </li>
            ))}
          </ul>
        </DayGroup>
      ))}
    </div>
  );
}

function SessionRow({
  session,
  system,
  records,
}: {
  session: SessionLine;
  system: UnitSystem;
  records: number | null;
}) {
  const facts = [
    format(parseISO(session.startedAt), "HH:mm"),
    session.minutes != null ? durationLabel(session.minutes) : null,
    `${session.sets} ${session.sets === 1 ? "set" : "sets"}`,
    session.volumeKg > 0 ? `${formatVolume(session.volumeKg, system)} ${weightUnit(system)}` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/session/${session.id}/summary`}
      className="group flex min-h-14 items-center gap-3 py-2.5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-bold group-hover:text-accent">
            {session.title ?? "Workout"}
          </span>
          {records == null ? (
            <span aria-hidden className="h-[15px] w-7 flex-none animate-pulse rounded-[3px] bg-[#171b1d]" />
          ) : records > 0 ? (
            <span className="flex-none rounded-[3px] bg-accent px-1 py-0.5 font-mono text-[9px] leading-none font-extrabold text-[#0a0c0d]">
              {records > 1 ? `${records} PRs` : "PR"}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-fg-dim">{facts.join(" · ")}</div>
      </div>
      <NavSpinner className="text-fg-dim" />
      <ChevronRight aria-hidden className="size-4 flex-none text-fg-faint group-hover:text-accent" />
    </Link>
  );
}
