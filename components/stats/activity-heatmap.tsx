"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { weekDayNames, type WeekStartDay } from "@/lib/dates";
import type { UnitSystem } from "@/lib/database.types";
import type { ActivityDay, ActivityLevel, ActivityYear } from "@/lib/training/activity";
import { formatVolume, weightUnit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { Card } from "@/components/kit/card";
import { NavSpinner } from "@/components/shell/nav-spinner";

/** Lime mixed into the card surface at 25 / 45 / 70 / 100 %. */
const LEVEL_FILL: Record<ActivityLevel, string> = {
  0: "#171b1d",
  1: "#3e4a22",
  2: "#63772e",
  3: "#92af3c",
  4: "#c9f24d",
};

const CELL = 11;
// Three labels down the side are enough to find a weekday without crowding.
const LABELLED_ROWS = [1, 3, 5];

function minutesLabel(minutes: number) {
  return minutes >= 120 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
}

export function ActivityHeatmap({
  year,
  system,
  weekStartsOn,
}: {
  year: ActivityYear;
  system: UnitSystem;
  weekStartsOn: WeekStartDay;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const dayNames = weekDayNames(weekStartsOn);
  const unit = weightUnit(system);

  // On a phone only a few months fit; open on the most recent ones.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const volume = (kg: number) => `${formatVolume(kg, system)} ${unit}`;

  const describe = (day: ActivityDay) => {
    const date = format(parseISO(day.date), "EEE d MMM yyyy");
    if (day.isFuture) return date;
    if (day.sessions.length === 0) return `${date} · no training`;
    return [
      date,
      `${day.sessions.length} ${day.sessions.length === 1 ? "session" : "sessions"}`,
      day.minutes > 0 ? `${day.minutes} min` : "time not recorded",
      day.volumeKg > 0 ? volume(day.volumeKg) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const selectedDay = selected ? year.weeks.flat().find((d) => d.date === selected) : null;
  const { totals } = year;

  return (
    <Card className="rounded-[18px]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-bold">Training year</h2>
        <span className="font-mono text-[11px] text-fg-dim uppercase">
          {totals.sessions === 0
            ? "No sessions yet"
            : `${totals.activeDays} ${totals.activeDays === 1 ? "day" : "days"} · ${totals.sessions} ${
                totals.sessions === 1 ? "session" : "sessions"
              }${totals.minutes > 0 ? ` · ${minutesLabel(totals.minutes)}` : ""}`}
        </span>
      </div>

      <div ref={scroller} className="mt-3.5 overflow-x-auto pb-1.5">
        <div
          role="group"
          aria-label="Training by day, last 53 weeks"
          className="inline-grid gap-[3px]"
          style={{
            gridTemplateColumns: `26px repeat(${year.weeks.length}, ${CELL}px)`,
            gridTemplateRows: `12px repeat(7, ${CELL}px)`,
          }}
          onClick={(event) => {
            const date = (event.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset
              .date;
            if (date) setSelected((current) => (current === date ? null : date));
          }}
        >
          {year.months.map((month) => (
            <span
              key={`${month.column}-${month.label}`}
              aria-hidden
              className="font-mono text-[9px] leading-none whitespace-nowrap text-fg-dim"
              style={{ gridColumn: month.column + 2, gridRow: 1 }}
            >
              {month.label}
            </span>
          ))}

          {/* Pinned while the strip scrolls, so a row can always be read as a
              weekday. It spans the month row too, so labels slide under it. */}
          <div
            aria-hidden
            className="sticky left-0 z-10 flex flex-col gap-[3px] bg-surface pr-1"
            style={{ gridColumn: 1, gridRow: "1 / span 8" }}
          >
            <span style={{ height: 12 }} />
            {dayNames.map((name, row) => (
              <span
                key={name}
                className="font-mono text-[9px] text-fg-dim"
                style={{ height: CELL, lineHeight: `${CELL}px` }}
              >
                {LABELLED_ROWS.includes(row) ? name : ""}
              </span>
            ))}
          </div>

          {year.weeks.map((week, column) =>
            week.map((day, row) => {
              const style = {
                gridColumn: column + 2,
                gridRow: row + 2,
                background: LEVEL_FILL[day.level],
              };
              const className = cn(
                "block rounded-[3px]",
                day.isFuture && "opacity-35",
                day.isToday && "outline outline-1 outline-offset-1 outline-fg-muted",
                selected === day.date && "outline outline-2 outline-offset-1 outline-accent",
              );
              return day.sessions.length > 0 ? (
                <button
                  key={day.date}
                  type="button"
                  data-date={day.date}
                  title={describe(day)}
                  aria-label={describe(day)}
                  aria-pressed={selected === day.date}
                  className={cn(className, "cursor-pointer")}
                  style={style}
                />
              ) : (
                <span
                  key={day.date}
                  aria-hidden
                  data-date={day.isFuture ? undefined : day.date}
                  title={describe(day)}
                  className={className}
                  style={style}
                />
              );
            }),
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="min-h-[18px] text-[12px] leading-[1.5] text-fg-soft">
          {selectedDay ? (
            <DayLine day={selectedDay} volume={volume} />
          ) : totals.sessions === 0 ? (
            "Finish a session and its day lights up here."
          ) : (
            <span className="text-fg-dim">Tap a day to see its sessions.</span>
          )}
        </p>
        <div aria-hidden className="ml-auto flex items-center gap-[3px] font-mono text-[9.5px] text-fg-dim uppercase">
          <span className="mr-1">Less</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span
              key={level}
              className="rounded-[3px]"
              style={{ width: CELL, height: CELL, background: LEVEL_FILL[level] }}
            />
          ))}
          <span className="ml-1">More</span>
        </div>
      </div>
    </Card>
  );
}

function DayLine({ day, volume }: { day: ActivityDay; volume: (kg: number) => string }) {
  const date = format(parseISO(day.date), "EEE, MMM d");
  if (day.sessions.length === 0) {
    return (
      <>
        <span className="font-semibold text-fg-2">{date}</span> · rest day
      </>
    );
  }
  return (
    <>
      <span className="font-semibold text-fg-2">{date}</span>
      {day.sessions.map((session) => (
        <span key={session.id}>
          {" · "}
          <span className="text-fg-2">{session.title ?? "Session"}</span>
          {session.minutes != null ? `, ${session.minutes} min` : ""}
          {session.volumeKg > 0 ? `, ${volume(session.volumeKg)}` : ""}
        </span>
      ))}
      {/* History files sessions by the same start day, so this lands on them. */}
      <Link
        href={`/history?month=${day.date.slice(0, 7)}&day=${day.date}`}
        className="ml-2 inline-flex items-center gap-1 font-mono text-[11px] font-semibold whitespace-nowrap text-accent uppercase hover:text-accent-hi"
      >
        <NavSpinner className="size-3" />
        Open in history →
      </Link>
    </>
  );
}
