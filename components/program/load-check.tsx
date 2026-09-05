import { Card } from "@/components/kit/card";
import { loadAdvice, type MuscleLoad } from "@/lib/program/volume";
import { cn } from "@/lib/utils";

export function LoadCheck({ load }: { load: MuscleLoad[] }) {
  return (
    <Card className="rounded-[18px]">
      <h2 className="mb-3 text-[15px] font-bold">Weekly load check</h2>
      <div className="flex flex-col gap-2.5">
        {load.map((row) => (
          <div key={row.key} className="flex items-center gap-2.5">
            <div className="w-[74px] flex-none text-[11.5px] font-semibold text-fg-muted">
              {row.label}
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  row.status === "under" ? "bg-warn" : "bg-accent",
                )}
                style={{ width: `${Math.round(row.ratio * 100)}%` }}
              />
            </div>
            <div className="w-[52px] flex-none text-right font-mono text-[10.5px] font-medium text-fg-soft">
              {row.sets} / {row.floor}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3.5 text-xs leading-[1.5] text-fg-soft">{loadAdvice(load)}</p>
    </Card>
  );
}
