import type { WeekStripDay } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

const STATE_STYLES: Record<WeekStripDay["state"], string> = {
  today: "border-line-sel bg-accent-soft",
  done: "border-line-hi bg-done",
  rest: "border-line bg-surface-2",
  plan: "border-line bg-surface-2",
  missed: "border-line bg-surface-2",
};

export function WeekStrip({ days }: { days: WeekStripDay[] }) {
  return (
    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
      {days.map((day) => (
        <div
          key={day.dayIndex}
          className={cn(
            "rounded-[14px] border p-3.5",
            STATE_STYLES[day.state],
          )}
        >
          <div
            className={cn(
              "font-mono text-[10px] font-semibold tracking-[0.1em]",
              day.state === "today" ? "text-accent" : "text-fg-dim",
            )}
          >
            {day.label}
          </div>
          <div
            className={cn(
              "mt-2 truncate text-[13px] font-bold",
              day.state === "rest" ? "text-fg-dim" : "text-fg",
            )}
          >
            {day.name}
          </div>
          <div
            className={cn(
              "mt-1 font-mono text-[10px]",
              day.state === "done"
                ? "text-accent-2"
                : day.state === "missed"
                  ? "text-warn"
                  : "text-fg-dim",
            )}
          >
            {day.meta}
          </div>
        </div>
      ))}
    </div>
  );
}
