import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-line bg-surface p-5",
        className,
      )}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("eyebrow", className)} {...props} />;
}

/** A stat card: eyebrow, big number, unit, delta line. */
export function StatCard({
  label,
  value,
  unit,
  delta,
  tone = "dim",
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  tone?: "accent" | "warn" | "dim";
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-2.5">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-baseline gap-1.5">
        <div
          className={cn(
            "font-mono text-[26px] leading-none font-extrabold tracking-[-0.03em]",
            // An em-dash placeholder should read as absence, not as a number.
            value === "—" && "text-fg-dim",
          )}
        >
          {value}
        </div>
        {unit ? <div className="text-xs text-fg-soft">{unit}</div> : null}
      </div>
      {children}
      {delta ? (
        <div
          className={cn(
            "text-[11.5px] font-semibold",
            tone === "accent" && "text-accent",
            tone === "warn" && "text-warn",
            tone === "dim" && "text-fg-dim",
          )}
        >
          {delta}
        </div>
      ) : null}
    </Card>
  );
}
