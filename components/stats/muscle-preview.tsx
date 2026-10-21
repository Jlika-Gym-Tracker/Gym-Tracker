import type { BodyFigure } from "@/lib/database.types";
import { MUSCLE_LABEL, untrainedMuscles, type MuscleLoad } from "@/lib/training/muscle-load";
import { MuscleMap } from "./muscle-map";

/**
 * A small muscle map with the muscles it leaves out named underneath — for the
 * builder ("what this day hits") and the finish summary ("what you trained").
 * Rendered on the server and handed to client screens as a finished node, so
 * the body artwork never ships to the browser for these.
 */
export function MusclePreview({
  title,
  load,
  figure,
  empty,
}: {
  title: string;
  load: MuscleLoad;
  figure: BodyFigure;
  /** Shown instead of the map when nothing has been counted yet. */
  empty: string;
}) {
  const missing = untrainedMuscles(load);
  const anything = missing.length < Object.keys(MUSCLE_LABEL).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="eyebrow">{title}</div>
      {anything ? (
        <>
          <MuscleMap load={load} figure={figure} size="sm" />
          <p className="text-[11.5px] leading-[1.5] text-fg-dim">
            {missing.length === 0
              ? "Every muscle gets something."
              : `Not touched: ${missing.map((m) => MUSCLE_LABEL[m]).join(", ")}.`}
          </p>
        </>
      ) : (
        <p className="text-[12.5px] leading-[1.5] text-fg-dim">{empty}</p>
      )}
    </div>
  );
}
