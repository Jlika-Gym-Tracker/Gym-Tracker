import Link from "next/link";
import { cn } from "@/lib/utils";
import { NavSpinner } from "@/components/shell/nav-spinner";

/**
 * The screen-level empty state: eyebrow, display headline, one line of copy and
 * up to two actions. Mirrors the mockup's hero card minus the photography.
 */
export function EmptyState({
  eyebrow,
  title,
  body,
  action,
  secondaryAction,
  watermark,
  className,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
  /** Ghost lime word bled off the bottom-right corner, as in the hero cards. */
  watermark?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[268px] flex-col overflow-hidden rounded-[20px] border border-line bg-surface px-7 py-[26px]",
        className,
      )}
    >
      {watermark ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-1.5 -bottom-[22px] leading-none font-extrabold tracking-[-0.06em] text-accent opacity-[0.07] select-none"
            style={{ fontSize: 150 }}
          >
            {watermark}
          </div>
          {/* Same left-to-right scrim the hero cards use, so the watermark sits
              behind the copy instead of competing with it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#101214f5_0%,#101214cc_50%,#10121455_100%)]"
          />
        </>
      ) : null}

      <div className="relative flex flex-1 flex-col">
        <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
          {eyebrow}
        </div>
        <h2 className="display mt-4 mb-2 max-w-[460px] text-[38px]">{title}</h2>
        <p className="max-w-[420px] text-[13.5px] leading-[1.5] text-fg-muted">
          {body}
        </p>

        {action ? (
          <div className="mt-auto flex items-center gap-2.5 pt-6">
            <Link
              href={action.href}
              className="inline-flex items-center gap-1.5 rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi"
            >
              <NavSpinner />
              {action.label}
            </Link>
            {secondaryAction ? (
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center gap-1.5 rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-sm font-semibold text-fg-2 transition-colors hover:bg-hover"
              >
                <NavSpinner />
                {secondaryAction.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
