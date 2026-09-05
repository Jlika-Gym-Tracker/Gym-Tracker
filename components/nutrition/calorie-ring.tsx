import { cn } from "@/lib/utils";

/**
 * Calories eaten against target. Pure SVG — a chart library for one arc would
 * be a lot of JavaScript for a circle.
 */
export function CalorieRing({
  consumed,
  target,
  size = 152,
  className,
}: {
  consumed: number;
  target: number;
  size?: number;
  className?: string;
}) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0;
  const over = target > 0 && consumed > target;

  return (
    <div className={cn("relative flex-none", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--border)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={over ? "var(--warn)" : "var(--accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[26px] leading-none font-extrabold tracking-[-0.03em]">
          {Math.round(consumed)}
        </span>
        <span className="mt-1 font-mono text-[10px] text-fg-dim">
          / {Math.round(target)} KCAL
        </span>
      </div>
    </div>
  );
}

/** One macro bar: eaten vs target. */
export function MacroTile({
  name,
  consumed,
  target,
  color,
}: {
  name: string;
  consumed: number;
  target: number;
  color: string;
}) {
  const pct = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  return (
    <div className="flex-1 rounded-xl border border-line bg-surface-2 p-3">
      <div className="eyebrow">{name}</div>
      <div className="my-1.5 text-[17px] font-extrabold tracking-[-0.02em]">
        {Math.round(consumed)}
        <span className="text-[11px] font-medium text-fg-dim"> / {Math.round(target)} g</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
