"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { CalendarDay } from "@/lib/training/history";
import { cn } from "@/lib/utils";

/**
 * The picked day, shared by the calendar and the list under it. Picking a day
 * is local — it scrolls to the day and rewrites ?day= in place — because the
 * month's data is already on the page and a round trip per tap would be waste.
 */
type Selection = { selected: string | null; select: (day: string | null) => void };

const SelectionContext = createContext<Selection>({ selected: null, select: () => {} });

const dayId = (date: string) => `day-${date}`;

function reveal(date: string, behavior: ScrollBehavior) {
  document.getElementById(dayId(date))?.scrollIntoView({ behavior, block: "start" });
}

/**
 * Remounted by the page for every month and ?day= (it is keyed on both), so
 * arriving from the Progress heatmap starts on that day without an effect
 * having to sync props into state.
 */
export function HistorySelection({
  month,
  initialDay,
  children,
}: {
  month: string;
  initialDay: string | null;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState(initialDay);

  // A link straight to a day (the heatmap's) lands on it, not on the calendar.
  useEffect(() => {
    if (initialDay) reveal(initialDay, "auto");
  }, [initialDay]);

  const select = useCallback(
    (day: string | null) => {
      setSelected(day);
      // Native replaceState keeps Next's router in step without a refetch, and
      // leaves a URL that reopens this day.
      window.history.replaceState(null, "", `/history?month=${month}${day ? `&day=${day}` : ""}`);
      if (day) reveal(day, "smooth");
    },
    [month],
  );

  return <SelectionContext.Provider value={{ selected, select }}>{children}</SelectionContext.Provider>;
}

/** The month's grid: a lime tile for each day trained, tappable to jump to it. */
export function MonthCalendar({
  weeks,
  dayNames,
}: {
  weeks: (CalendarDay | null)[][];
  /** Weekday initials in the order this lifter's week runs. */
  dayNames: string[];
}) {
  const { selected, select } = useContext(SelectionContext);

  return (
    <div role="group" aria-label="Days trained this month">
      <div aria-hidden className="grid grid-cols-7 gap-1 pb-1.5 sm:gap-1.5">
        {dayNames.map((name) => (
          <span key={name} className="text-center font-mono text-[9.5px] tracking-[0.08em] text-fg-dim uppercase">
            {name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weeks.flat().map((day, i) => {
          if (!day) return <span key={`blank-${i}`} aria-hidden />;
          const trained = day.sessions > 0;
          const picked = selected === day.date;
          const label = format(parseISO(day.date), "EEEE d MMMM");
          const cell = cn(
            "relative flex aspect-square min-h-10 flex-col items-center justify-center rounded-[10px] font-mono text-[12.5px] font-semibold tabular-nums transition-colors sm:min-h-11",
            day.isToday && "outline outline-1 -outline-offset-1 outline-fg-muted",
            picked && "outline outline-2 outline-offset-1 outline-accent",
          );
          if (!trained) {
            return (
              <span
                key={day.date}
                aria-label={`${label}, ${day.isFuture ? "still to come" : "no training"}`}
                className={cn(cell, "text-fg-faint", day.isFuture && "opacity-50")}
              >
                {day.dayOfMonth}
              </span>
            );
          }
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={picked}
              aria-label={`${label}, ${day.sessions} ${day.sessions === 1 ? "session" : "sessions"}`}
              onClick={() => select(picked ? null : day.date)}
              className={cn(cell, "bg-accent text-[#0a0c0d] hover:bg-accent-hi")}
            >
              {day.dayOfMonth}
              {day.sessions > 1 ? (
                // Two sessions in a day get a small count, not a second colour.
                <span className="absolute right-1 bottom-0.5 text-[8.5px] leading-none font-extrabold opacity-70">
                  ×{day.sessions}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One day's sessions in the list; lights up when its day is picked. */
export function DayGroup({ date, children }: { date: string; children: React.ReactNode }) {
  const { selected } = useContext(SelectionContext);
  const picked = selected === date;
  return (
    <section
      id={dayId(date)}
      aria-current={picked ? "date" : undefined}
      className={cn(
        "scroll-mt-4 rounded-[16px] border px-3 py-2.5 transition-colors sm:px-4",
        picked ? "border-line-sel bg-done" : "border-transparent",
      )}
    >
      {children}
    </section>
  );
}

/** Previous / next month. The chevron turns into a spinner the moment it is tapped. */
export function MonthStep({
  href,
  direction,
  label,
}: {
  href: string | null;
  direction: "prev" | "next";
  label: string;
}) {
  const className =
    "flex size-11 flex-none items-center justify-center rounded-[11px] border border-stroke bg-ghost text-fg-2 transition-colors";
  if (!href) {
    return (
      <span aria-hidden className={cn(className, "opacity-35")}>
        {direction === "prev" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(className, "hover:bg-hover")}>
      <StepIcon direction={direction} />
    </Link>
  );
}

function StepIcon({ direction }: { direction: "prev" | "next" }) {
  const { pending } = useLinkStatus();
  if (pending) return <Loader2 className="size-4 animate-spin" aria-hidden />;
  return direction === "prev" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />;
}
