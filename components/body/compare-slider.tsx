"use client";

import { useCallback, useRef, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { PhotoWithUrl } from "@/lib/body/queries";

/**
 * Before/after with a draggable divider.
 *
 * The divider is a real range input underneath a painted handle, so it works
 * with a mouse, a finger and arrow keys without three separate code paths.
 */
export function CompareSlider({
  before,
  after,
}: {
  before: PhotoWithUrl;
  after: PhotoWithUrl;
}) {
  const [position, setPosition] = useState(50);
  const frame = useRef<HTMLDivElement>(null);

  const drag = useCallback((clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const pct = ((clientX - box.left) / box.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  const days = differenceInCalendarDays(parseISO(after.taken_on), parseISO(before.taken_on));

  return (
    <div>
      <div
        ref={frame}
        onPointerMove={(e) => e.buttons === 1 && drag(e.clientX)}
        onPointerDown={(e) => drag(e.clientX)}
        className="relative aspect-[3/4] max-h-[520px] w-full touch-none overflow-hidden rounded-[14px] border border-line bg-surface-2 select-none"
      >
        {after.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={after.url}
            alt={`Progress photo from ${after.taken_on}`}
            className="absolute inset-0 size-full object-cover"
            draggable={false}
          />
        ) : null}

        <div
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${position}%` }}
        >
          {before.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={before.url}
              alt={`Progress photo from ${before.taken_on}`}
              // Sized to the frame, not to the clipped box, so the two images
              // stay in register as the divider moves.
              className="absolute inset-0 h-full object-cover"
              style={{ width: frame.current?.clientWidth ?? "100%" }}
              draggable={false}
            />
          ) : null}
          <span className="absolute top-3 left-3 rounded-md bg-[#0a0c0dcc] px-2 py-1 font-mono text-[10px] font-bold tracking-[0.1em] text-fg">
            {format(parseISO(before.taken_on), "MMM dd").toUpperCase()}
          </span>
        </div>

        <span className="absolute top-3 right-3 rounded-md bg-[#0a0c0dcc] px-2 py-1 font-mono text-[10px] font-bold tracking-[0.1em] text-fg">
          {format(parseISO(after.taken_on), "MMM dd").toUpperCase()}
        </span>

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
          style={{ left: `${position}%` }}
        >
          <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-accent bg-bg font-mono text-[10px] font-bold text-accent">
            ↔
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label="Comparison position"
          className="absolute inset-x-0 bottom-0 h-10 w-full cursor-ew-resize opacity-0"
        />
      </div>

      <p className="mt-2.5 text-center font-mono text-[10.5px] text-fg-dim uppercase">
        {days} days apart
      </p>
    </div>
  );
}
