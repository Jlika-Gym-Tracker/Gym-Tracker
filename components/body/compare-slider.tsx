"use client";

import { useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { PhotoWithUrl } from "@/lib/body/queries";

/**
 * Before/after with a draggable divider.
 *
 * Both photos are laid out identically — same box, same object-fit — and the
 * divider reveals one over the other with a clip-path. Sizing the top image
 * from a measured width instead put the two out of register, because the ref is
 * null on first paint and nothing re-rendered once it filled in.
 *
 * The frame's width is capped rather than its height: `aspect-[3/4]` with only
 * a max-height leaves the width free to fill a wide screen, which turns a
 * portrait photo into a cropped sliver of torso.
 */
export function CompareSlider({
  before,
  after,
}: {
  before: PhotoWithUrl;
  after: PhotoWithUrl;
}) {
  const [position, setPosition] = useState(50);
  const days = differenceInCalendarDays(parseISO(after.taken_on), parseISO(before.taken_on));

  return (
    <div>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[420px] overflow-hidden rounded-[14px] border border-line bg-surface-2 select-none">
        {after.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={after.url}
            alt={`Progress photo from ${after.taken_on}`}
            className="absolute inset-0 size-full object-cover"
            draggable={false}
          />
        ) : null}

        {/* Same box, same fit — only the reveal differs. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {before.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={before.url}
              alt={`Progress photo from ${before.taken_on}`}
              className="absolute inset-0 size-full object-cover"
              draggable={false}
            />
          ) : null}
        </div>

        {/* Labels sit outside the clip so neither disappears as you drag. */}
        <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-[#0a0c0dcc] px-2 py-1 font-mono text-[10px] font-bold tracking-[0.1em] text-fg">
          {format(parseISO(before.taken_on), "MMM dd").toUpperCase()}
        </span>
        <span className="pointer-events-none absolute top-3 right-3 rounded-md bg-[#0a0c0dcc] px-2 py-1 font-mono text-[10px] font-bold tracking-[0.1em] text-fg">
          {format(parseISO(after.taken_on), "MMM dd").toUpperCase()}
        </span>

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent"
          style={{ left: `${position}%` }}
        >
          <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-accent bg-bg font-mono text-[10px] font-bold text-accent">
            ↔
          </span>
        </div>

        {/*
          A range input covering the frame drives it: pointer drag, touch and
          arrow keys all work without three separate code paths.
        */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label="Reveal more of the earlier photo"
          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
        />
      </div>

      <p className="mt-2.5 text-center font-mono text-[10.5px] text-fg-dim uppercase">
        {days === 0 ? "Same day" : `${days} days apart`}
      </p>
    </div>
  );
}
