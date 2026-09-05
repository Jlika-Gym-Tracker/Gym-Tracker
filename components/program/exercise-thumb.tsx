import { cn } from "@/lib/utils";

const MUSCLE_SHORT: Record<string, string> = {
  chest: "CH", lats: "LA", middle_back: "BK", lower_back: "LB", traps: "TR",
  shoulders: "SH", biceps: "BI", triceps: "TR", forearms: "FA", quadriceps: "QU",
  hamstrings: "HA", glutes: "GL", calves: "CA", abdominals: "AB",
  abductors: "AD", adductors: "AD", neck: "NE",
};

/**
 * Exercise photo, or a muscle-coded tile when the library has no image —
 * better than a broken image frame or a generic grey box.
 */
export function ExerciseThumb({
  src,
  muscle,
  size = 30,
  className,
}: {
  src: string | null;
  muscle: string;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      // Library photos come from the public-domain free-exercise-db on GitHub;
      // next/image would need a remotePatterns entry and buys nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={cn("flex-none rounded-lg bg-surface-2 object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-lg border border-line bg-surface-2 font-mono font-bold text-fg-dim",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.3) }}
    >
      {MUSCLE_SHORT[muscle] ?? "EX"}
    </div>
  );
}
