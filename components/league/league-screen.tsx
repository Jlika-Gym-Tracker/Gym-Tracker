"use client";

import { useActionState, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  createChallenge,
  joinSeason,
  respondToChallenge,
  type ActionState,
} from "@/app/actions/league";
import {
  BADGES,
  challengeProgress,
  nextSessionValue,
  rankStandings,
  scoreFor,
  type Standing,
  type StandingsTab,
} from "@/lib/league";
import type { SeasonView } from "@/lib/league-data/queries";
import { DAY_NAMES } from "@/lib/dates";
import { Card } from "@/components/kit/card";
import { AvatarBubble } from "@/components/shell/avatar-bubble";
import { ChartLegend, DualLineChart } from "@/components/charts/line-chart";
import { HeroBackdrop } from "@/components/kit/hero-backdrop";
import { Message } from "@/components/profile/controls";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/kit/action-button";

const TABS: { key: StandingsTab; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "consistency", label: "Consistency" },
  { key: "transformation", label: "Transformation" },
];

const SERIES_COLORS = ["#c9f24d", "#e7ebe8", "#7d9440", "#4a5560", "#c98d4d"];

export function LeagueScreen({ view, meId }: { view: SeasonView; meId: string }) {
  const [tab, setTab] = useState<StandingsTab>("overall");
  const [joinState, join] = useActionState(joinSeason, {} as ActionState);

  if (!view.isMember) {
    return (
      <Card className="max-w-[640px]">
        <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
          {view.season.name}
        </div>
        <h1 className="display mt-4 mb-2 text-[32px]">Join the season?</h1>
        <p className="max-w-[440px] text-[13.5px] leading-[1.55] text-fg-muted">
          Your baseline is captured the moment you join — a seven-day average of
          your weight and waist, not the number on the scale today. Everything
          afterwards is measured against it.
        </p>
        <form action={join} className="mt-6">
          <input type="hidden" name="seasonId" value={view.season.id} />
          <ActionButton
            className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Join {view.season.name}
          </ActionButton>
        </form>
        <div className="mt-3">
          <Message error={joinState.error} notice={joinState.notice} />
        </div>
      </Card>
    );
  }

  const ranked = rankStandings(view.standings, tab);
  const me = ranked.find((s) => s.userId === meId);
  const myRank = me ? ranked.indexOf(me) + 1 : null;
  const leader = ranked[0];
  const gap = me && leader ? scoreFor(leader, tab) - scoreFor(me, tab) : 0;
  const names = view.standings.map((s) => s.displayName);

  return (
    <div className="flex flex-col gap-[18px]">
      <SeasonHero
        view={view}
        me={me}
        myRank={myRank}
        gap={gap}
        leaderName={leader?.displayName ?? null}
      />

      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_372px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Card className="rounded-[18px]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-bold">Standings</h2>
              <div className="ml-auto flex gap-1 rounded-[9px] border border-line bg-surface-2 p-[3px]">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold uppercase transition-colors",
                      tab === t.key ? "bg-accent text-[#0a0c0d]" : "text-fg-soft hover:text-fg",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[36px_1fr_150px_110px_90px] gap-2.5 pb-2 font-mono text-[10px] tracking-[0.1em] text-fg-dim uppercase">
              <div>#</div>
              <div>Athlete</div>
              <div>This week</div>
              <div>{tab === "transformation" ? "Toward goal" : "Sessions"}</div>
              <div className="text-right">Points</div>
            </div>

            {ranked.map((row, index) => {
              const isMe = row.userId === meId;
              return (
                <div
                  key={row.userId}
                  className={cn(
                    "grid grid-cols-[36px_1fr_150px_110px_90px] items-center gap-2.5 rounded-[10px] border px-2 py-2.5",
                    isMe ? "border-line-sel bg-accent-soft" : "border-[#171b1d] bg-surface-2",
                    index > 0 && "mt-1.5",
                  )}
                >
                  <div
                    className={cn(
                      "font-mono text-[13px] font-bold",
                      index === 0 ? "text-accent" : "text-fg-dim",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AvatarBubble name={row.displayName} src={row.avatarUrl} size={28} />
                    <span className="truncate text-[13px] font-semibold">
                      {row.displayName}
                      {isMe ? <span className="ml-1 text-fg-dim">(you)</span> : null}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {DAY_NAMES.map((day, dayIndex) => (
                      <span
                        key={day}
                        title={day}
                        className={cn(
                          "size-2.5 rounded-[2px]",
                          row.weekDots.includes(dayIndex) ? "bg-accent" : "bg-line",
                        )}
                      />
                    ))}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-[12px] font-semibold",
                      tab === "transformation" ? "text-accent" : "text-fg-2",
                    )}
                  >
                    {tab === "transformation"
                      ? `${row.goalProgressPct > 0 ? "+" : ""}${row.goalProgressPct.toFixed(1)} %`
                      : row.sessions}
                  </div>
                  <div className="text-right font-mono text-[13px] font-bold">
                    {scoreFor(row, tab).toLocaleString()}
                  </div>
                </div>
              );
            })}

            <p className="mt-3.5 text-[11.5px] leading-[1.5] text-fg-dim">
              Only points and percentages are shared. Nobody sees your weight, your
              measurements, your photos or what you lifted.
            </p>
          </Card>

          <Card className="rounded-[18px]">
            <h2 className="mb-1 text-[15px] font-bold">Cumulative points</h2>
            {view.cumulative.length >= 2 ? (
              <>
                <DualLineChart
                  data={view.cumulative}
                  height={170}
                  series={names.map((name, i) => ({
                    key: name,
                    name,
                    color: SERIES_COLORS[i % SERIES_COLORS.length]!,
                  }))}
                />
                <ChartLegend
                  items={names.map((name, i) => ({
                    name,
                    color: SERIES_COLORS[i % SERIES_COLORS.length]!,
                  }))}
                />
              </>
            ) : (
              <p className="py-8 text-center text-[13px] text-fg-dim">
                Two weeks of scores draw the race. The nightly job fills this in.
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-[18px]">
          <ChallengesPanel view={view} meId={meId} />
          <BadgesPanel view={view} meId={meId} />
        </div>
      </div>
    </div>
  );
}

function SeasonHero({
  view,
  me,
  myRank,
  gap,
  leaderName,
}: {
  view: SeasonView;
  me?: Standing;
  myRank: number | null;
  gap: number;
  leaderName: string | null;
}) {
  const leading = myRank === 1;
  return (
    <div className="relative flex min-h-[240px] flex-col overflow-hidden rounded-[20px] border border-line bg-surface px-7 py-[26px]">
      <HeroBackdrop
        images={view.standings.map((s) => s.avatarUrl)}
        watermark={view.season.name.toUpperCase()}
      />
      <div className="relative flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
            Crew league · {view.season.name}
          </span>
          <span className="font-mono text-[10.5px] text-fg-soft uppercase">
            {format(parseISO(view.season.starts_on), "MMM dd")} –{" "}
            {format(parseISO(view.season.ends_on), "MMM dd")} · week{" "}
            {Math.min(view.weekIndex + 1, view.totalWeeks)} of {view.totalWeeks}
          </span>
        </div>

        <h1 className="display mt-3.5 mb-2 max-w-[520px] text-[38px]">
          {myRank == null
            ? "Nothing scored yet."
            : leading
              ? "You're leading."
              : `You're ${ordinal(myRank)}${leaderName ? `. ${leaderName} is ahead.` : "."}`}
        </h1>
        <p className="max-w-[460px] text-[13.5px] leading-[1.5] text-fg-muted">
          Points for showing up and for moving toward <em>your</em> goal — never for
          absolute weight. Everyone competes on percentage change, so a cut and a
          bulk sit on the same board.
        </p>

        <div className="mt-auto flex flex-wrap gap-7 pt-5">
          <Stat label="Your points" value={me ? (me.consistencyPts + me.transformationPts).toLocaleString() : "—"} accent />
          <Stat label="Gap to 1st" value={myRank === 1 ? "Leader" : gap ? `-${gap.toLocaleString()}` : "—"} />
          <Stat
            label="Next session worth"
            value={`+${nextSessionValue(me?.weekDots.length ?? 0)}`}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-extrabold tracking-[-0.03em]",
          accent && "text-accent",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ordinal(n: number) {
  const suffix = ["th", "st", "nd", "rd"][(n % 100) - 20] ?? ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

const KIND_STYLES: Record<string, { label: string; fg: string; bg: string }> = {
  crew: { label: "Crew", fg: "text-accent", bg: "bg-accent-soft" },
  head_to_head: { label: "Head-to-head", fg: "text-warn", bg: "bg-warn-soft" },
  personal: { label: "Personal", fg: "text-fg-soft", bg: "bg-surface-2" },
};

function ChallengesPanel({ view, meId }: { view: SeasonView; meId: string }) {
  const [createState, create] = useActionState(createChallenge, {} as ActionState);
  const [respondState, respond] = useActionState(respondToChallenge, {} as ActionState);
  const [open, setOpen] = useState(false);

  const others = view.standings.filter((s) => s.userId !== meId);

  return (
    <Card className="rounded-[18px]">
      <div className="mb-3 flex items-center">
        <h2 className="text-[15px] font-bold">Challenges</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto font-mono text-[11px] font-semibold text-accent hover:text-accent-hi"
        >
          {open ? "CLOSE" : "NEW +"}
        </button>
      </div>

      {open ? (
        <form action={create} className="mb-4 flex flex-col gap-2.5 rounded-[12px] border border-line bg-surface-2 p-3">
          <input type="hidden" name="seasonId" value={view.season.id} />
          <input
            name="title"
            placeholder="16 sessions in September"
            required
            className="w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-line-hi"
          />
          <div className="grid grid-cols-2 gap-2">
            <select name="kind" className="rounded-[9px] border border-line bg-surface px-2.5 py-2 text-[12px]">
              <option value="crew">Crew</option>
              <option value="head_to_head">Head-to-head</option>
              <option value="personal">Personal</option>
            </select>
            <select name="metric" className="rounded-[9px] border border-line bg-surface px-2.5 py-2 text-[12px]">
              <option value="sessions">Sessions</option>
              <option value="sets">Sets</option>
              <option value="waist_pct">Waist %</option>
              <option value="weight_pct">Weight %</option>
              <option value="protein_days">Protein days</option>
              <option value="streak">Streak</option>
            </select>
            <input
              name="target" type="number" min={1} placeholder="Target" required
              className="rounded-[9px] border border-line bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-line-hi"
            />
            <input
              name="days" type="number" min={1} max={90} defaultValue={30} placeholder="Days"
              className="rounded-[9px] border border-line bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-line-hi"
            />
          </div>
          {others.length > 0 ? (
            <select name="opponentId" className="rounded-[9px] border border-line bg-surface px-2.5 py-2 text-[12px]">
              <option value="">Opponent (head-to-head only)</option>
              {others.map((o) => (
                <option key={o.userId} value={o.userId}>{o.displayName}</option>
              ))}
            </select>
          ) : null}
          <input
            name="stakes" placeholder="Stakes — loser cooks" maxLength={120}
            className="w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-line-hi"
          />
          <Message error={createState.error} notice={createState.notice} />
          <ActionButton
            className="rounded-[10px] bg-accent px-4 py-2.5 text-[12.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Create challenge
          </ActionButton>
        </form>
      ) : null}

      {view.challenges.length === 0 ? (
        <p className="py-6 text-center text-[13px] leading-[1.55] text-fg-dim">
          No challenges yet. Bet a coffee on who trains most this month.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {view.challenges.map((challenge) => {
            const style = KIND_STYLES[challenge.kind] ?? KIND_STYLES.personal!;
            const mine = challenge.participants.find((p) => p.user_id === meId);
            const progress = challengeProgress(
              Number(mine?.progress ?? 0),
              Number(challenge.target ?? 0),
            );
            const needsAnswer =
              challenge.status === "pending" && mine && !mine.accepted;

            return (
              <div
                key={challenge.id}
                className={cn(
                  "rounded-[14px] border p-3.5",
                  challenge.status === "live"
                    ? "border-line-hi bg-done"
                    : "border-line bg-surface-2",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-2 py-1 font-mono text-[9.5px] font-bold tracking-[0.1em] uppercase",
                      style.fg,
                      style.bg,
                    )}
                  >
                    {style.label} · {challenge.status}
                  </span>
                  <span className="ml-auto font-mono text-[9.5px] text-fg-dim uppercase">
                    ends {format(parseISO(challenge.ends_on), "MMM dd")}
                  </span>
                </div>
                <div className="mt-2 text-[13.5px] font-bold">{challenge.title}</div>
                {challenge.stakes ? (
                  <div className="mt-1 text-[11.5px] text-fg-soft">{challenge.stakes}</div>
                ) : null}

                <div className="mt-2.5 flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10.5px] text-fg-soft">
                    {Math.round(Number(mine?.progress ?? 0))} / {Number(challenge.target ?? 0)}
                  </span>
                </div>

                {needsAnswer ? (
                  <div className="mt-3 flex gap-2">
                    <form action={respond}>
                      <input type="hidden" name="challengeId" value={challenge.id} />
                      <input type="hidden" name="accept" value="yes" />
                      <ActionButton className="rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-bold text-[#0a0c0d]">
                        Accept
                      </ActionButton>
                    </form>
                    <form action={respond}>
                      <input type="hidden" name="challengeId" value={challenge.id} />
                      <input type="hidden" name="accept" value="no" />
                      <ActionButton className="rounded-lg border border-stroke px-3 py-1.5 text-[11.5px] font-semibold text-fg-soft">
                        Decline
                      </ActionButton>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3">
        <Message error={respondState.error} notice={respondState.notice} />
      </div>
    </Card>
  );
}

function BadgesPanel({ view, meId }: { view: SeasonView; meId: string }) {
  const mine = new Set(view.badges.filter((b) => b.user_id === meId).map((b) => b.slug));
  return (
    <Card className="rounded-[18px]">
      <h2 className="mb-3 text-[15px] font-bold">Season badges</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {BADGES.map((badge) => {
          const earned = mine.has(badge.slug);
          return (
            <div
              key={badge.slug}
              className={cn(
                "rounded-xl border p-3",
                earned ? "border-line-hi bg-done" : "border-line bg-surface-2",
              )}
            >
              <div
                className={cn("size-2.5 rounded-[2px]", earned ? "bg-accent" : "bg-line")}
              />
              <div
                className={cn(
                  "mt-2 text-[12.5px] font-bold",
                  earned ? "text-fg" : "text-fg-dim",
                )}
              >
                {badge.name}
              </div>
              <div className="mt-0.5 font-mono text-[9.5px] text-fg-dim uppercase">
                {badge.detail}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
