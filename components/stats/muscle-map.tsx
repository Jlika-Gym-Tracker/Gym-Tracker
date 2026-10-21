import type { BodyFigure } from "@/lib/database.types";
import { BODY_PATHS, type BodySide, type BodyView } from "@/lib/muscles/body-paths";
import {
  MUSCLES,
  MUSCLE_LABEL,
  peakLoad,
  untrainedMuscles,
  type MuscleLoad,
} from "@/lib/training/muscle-load";
import { trimNumber } from "@/lib/units";
import { cn } from "@/lib/utils";
import { accentRamp } from "./ramp";

const UNWORKED = "#2a3033";
const SILHOUETTE = "#1b2022";
const HAIR = "#121517";

/** A muscle's fill: grey with no work, then deep to bright lime against the busiest muscle. */
export function muscleFill(sets: number | undefined, peak: number): string {
  if (!sets || sets <= 0 || peak <= 0) return UNWORKED;
  return accentRamp(sets / peak);
}

function setsLabel(sets: number) {
  return `${trimNumber(sets)} ${sets === 1 ? "set" : "sets"}`;
}

/**
 * Front and back of a body, each muscle shaded by how much work it got
 * relative to the busiest one.
 *
 * Presentational and hook-free, so it renders on the server as well as inside
 * a client component. The drawing is hidden from assistive tech; a caption
 * lists the same numbers in words.
 *
 * Artwork: MuscleMap by Melih Colpan (MIT), see THIRD_PARTY_NOTICES.md.
 */
export function MuscleMap({
  load,
  figure,
  size = "md",
  className,
}: {
  /** Sets per muscle, as muscleLoad() returns it. Missing muscles count as no work. */
  load: MuscleLoad;
  figure: BodyFigure;
  /** "sm" fits inside a list row or summary; "md" is a card's main content. */
  size?: "sm" | "md";
  className?: string;
}) {
  const peak = peakLoad(load);
  const worked = MUSCLES.filter((m) => (load[m] ?? 0) > 0);
  const unworked = untrainedMuscles(load);

  return (
    <figure className={cn("mx-auto w-full", size === "sm" ? "max-w-[156px]" : "max-w-[300px]", className)}>
      <div aria-hidden className={cn("grid grid-cols-2", size === "sm" ? "gap-1.5" : "gap-3")}>
        {(["front", "back"] as const).map((side) => (
          <div key={side} className="flex flex-col items-center gap-1.5">
            <Body view={BODY_PATHS[figure][side]} side={side} load={load} peak={peak} />
            {size === "md" ? <span className="eyebrow">{side}</span> : null}
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {worked.length === 0
          ? "Muscle map: no muscle has any work yet."
          : `Muscle map. ${worked.map((m) => `${MUSCLE_LABEL[m]}: ${setsLabel(load[m]!)}`).join(", ")}.${
              unworked.length ? ` No work: ${unworked.map((m) => MUSCLE_LABEL[m]).join(", ")}.` : ""
            }`}
      </figcaption>
    </figure>
  );
}

function Body({
  view,
  side,
  load,
  peak,
}: {
  view: BodyView;
  side: BodySide;
  load: MuscleLoad;
  peak: number;
}) {
  return (
    <svg viewBox={view.viewBox} className="h-auto w-full" data-side={side}>
      <g fill={SILHOUETTE}>
        {view.silhouette.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g fill={HAIR}>
        {view.hair.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {view.regions.map(([muscle, paths]) => (
        <g key={muscle} style={{ fill: muscleFill(load[muscle], peak) }}>
          {/* Hover names the muscle on desktop; the caption covers screen readers. */}
          <title>{`${MUSCLE_LABEL[muscle]} · ${setsLabel(load[muscle] ?? 0)}`}</title>
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      ))}
    </svg>
  );
}
