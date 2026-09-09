import Link from "next/link";
import type { TodayOverview } from "@/lib/dashboard/queries";
import { StartSessionButton } from "@/components/session/start-session-button";
import { HeroBackdrop } from "@/components/kit/hero-backdrop";

const MUSCLE_LABEL: Record<string, string> = {
  chest: "CHEST", lats: "LATS", middle_back: "BACK", lower_back: "LOWER BACK",
  traps: "TRAPS", shoulders: "DELTS", biceps: "BICEPS", triceps: "TRICEPS",
  forearms: "FOREARMS", quadriceps: "QUADS", hamstrings: "HAMS",
  glutes: "GLUTES", calves: "CALVES", abdominals: "CORE",
  abductors: "ABDUCTORS", adductors: "ADDUCTORS", neck: "NECK",
};

/** The hero card: what you are training today, and the button that starts it. */
export function SessionHero({ overview }: { overview: TodayOverview }) {
  const { today, activeSessionId, weekLabel } = overview;

  return (
    <div className="relative flex min-h-[268px] flex-col overflow-hidden rounded-[20px] border border-line bg-surface px-7 py-[26px]">
      <HeroBackdrop
        images={overview.todayImages}
        watermark={today ? today.name.toUpperCase() : undefined}
      />

      <div className="relative flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
            {today ? `Day ${overview.todayIndex + 1} · ${today.name}` : "Rest day"}
          </span>
          {weekLabel ? (
            <span className="font-mono text-[10.5px] text-fg-soft uppercase">
              {weekLabel}
            </span>
          ) : null}
          {today ? (
            <span className="ml-auto flex flex-wrap gap-1.5">
              {today.muscles.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-stroke bg-[#0a0c0dbb] px-2 py-1 font-mono text-[10px] font-semibold text-[#c2ccc6]"
                >
                  {MUSCLE_LABEL[m] ?? m.toUpperCase()}
                </span>
              ))}
            </span>
          ) : null}
        </div>

        <h2 className="display mt-4 mb-2 max-w-[460px] text-[42px]">
          {activeSessionId
            ? "You're mid-session."
            : today
              ? "Push, pull, then get out."
              : "Rest day. Take it."}
        </h2>
        <p className="max-w-[420px] text-[13.5px] leading-[1.5] text-fg-muted">
          {activeSessionId
            ? "A session is still open. Pick it back up where you left off."
            : today
              ? today.focusNote ??
                `${today.exerciseCount} exercises · ${today.setCount} sets.`
              : "Nothing scheduled today. Walk, stretch, eat well — the week is written, not improvised."}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-6">
          {activeSessionId ? (
            <Link
              href={`/session/${activeSessionId}`}
              className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi"
            >
              Resume session
            </Link>
          ) : today ? (
            <div className="w-[230px]">
              <StartSessionButton
                variant="primary"
                dayId={today.dayId}
                name="Start session"
                meta={`${today.exerciseCount} exercises · ${today.setCount} sets`}
              />
            </div>
          ) : null}
          <Link
            href="/program"
            className="rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-sm font-semibold text-fg-2 transition-colors hover:bg-hover"
          >
            View week
          </Link>
        </div>
      </div>
    </div>
  );
}
