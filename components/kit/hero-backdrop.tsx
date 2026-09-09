import { cn } from "@/lib/utils";

/**
 * Photographic backdrop for a hero card.
 *
 * The design put photography behind every hero. Rather than stock imagery, this
 * builds one from pictures the screen is actually about — the movements in
 * today's session, the week's exercises — so the picture is specific to the
 * person looking at it instead of decorative.
 *
 * Heavily scrimmed on purpose: it is texture behind type, not a photo to look
 * at, and the copy has to stay readable over whatever lands here.
 */
export function HeroBackdrop({
  images,
  watermark,
  className,
}: {
  images: (string | null | undefined)[];
  /** Ghost word bled off the bottom-right corner. */
  watermark?: string;
  className?: string;
}) {
  const usable = images.filter((src): src is string => Boolean(src)).slice(0, 6);

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {usable.length > 0 ? (
        <div
          className="absolute inset-0 grid opacity-[0.42]"
          style={{ gridTemplateColumns: `repeat(${usable.length}, 1fr)` }}
        >
          {usable.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ))}
        </div>
      ) : null}

      {/* Left-to-right scrim, per the mockup's hero gradients. */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#101214fa_0%,#101214e8_42%,#10121466_100%)]" />
      {/* Vertical falloff so the strip does not read as six hard rectangles. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#10121466_0%,#10121400_35%,#101214cc_100%)]" />

      {watermark ? (
        <div
          className="absolute -right-1.5 -bottom-[22px] leading-none font-extrabold tracking-[-0.06em] text-accent opacity-[0.09] select-none"
          style={{ fontSize: 150 }}
        >
          {watermark}
        </div>
      ) : null}
    </div>
  );
}
