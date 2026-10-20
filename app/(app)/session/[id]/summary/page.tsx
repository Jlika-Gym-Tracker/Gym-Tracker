import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/training/queries";
import { getBestsBefore, isOwnSession } from "@/lib/training/history-queries";
import { monthOf, sessionDay } from "@/lib/training/history";
import { sessionRecords } from "@/lib/training/records";
import { bestSet, totalVolume } from "@/lib/training/e1rm";
import type { BodyFigure, EffortScale, UnitSystem } from "@/lib/database.types";
import { muscleLoad } from "@/lib/training/muscle-load";
import { MusclePreview } from "@/components/stats/muscle-preview";
import {
  distanceUnit,
  formatDuration,
  formatVolume,
  formatWeight,
  metresToDisplay,
  trimNumber,
  weightUnit,
} from "@/lib/units";
import { Card, Eyebrow, StatCard } from "@/components/kit/card";
import { SessionRating } from "@/components/session/session-rating";
import { EditableSets } from "@/components/history/edit-sets";
import { DeleteWorkout } from "@/components/history/delete-workout";
import { NavSpinner } from "@/components/shell/nav-spinner";

/**
 * The screen a finished session lands on: how long, how much, what was a
 * record, and one tap on how it felt. Records are judged against everything
 * logged before this session, never against itself.
 *
 * Also where an old session is opened from History, so its owner can fix a
 * set or delete it here.
 */
export default async function SessionSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: profile }, { data: settings }, session, own] = await Promise.all([
    supabase.from("profiles").select("unit_system, body_figure").maybeSingle(),
    supabase.from("user_settings").select("effort_scale").maybeSingle(),
    getSession(id),
    isOwnSession(id),
  ]);
  if (!session) notFound();
  if (!session.ended_at) redirect(`/session/${session.id}`);

  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const unit = weightUnit(system);

  const done = session.exercises
    .map((ex) => ({
      ex,
      sets: ex.sets
        .filter((s) => s.is_complete)
        .map((s) => ({
          weight_kg: s.weight_kg == null ? null : Number(s.weight_kg),
          reps: s.reps,
          rpe: s.rpe == null ? null : Number(s.rpe),
          duration_s: s.duration_s,
          distance_m: s.distance_m == null ? null : Number(s.distance_m),
        })),
    }))
    .filter((e) => e.sets.length > 0);

  // Only what started before this session: opened from History months later,
  // a session keeps the records it set at the time.
  const bests = await getBestsBefore(
    done.map((d) => d.ex.exercise.id),
    session.started_at,
    { excludeSessionId: session.id },
  );
  const records = sessionRecords(
    done.map((d) => ({
      id: d.ex.exercise.id,
      name: d.ex.exercise.name,
      tracking: d.ex.exercise.tracking ?? "reps",
      sets: d.sets,
    })),
    bests,
  );
  const recordIds = new Set(records.map((r) => r.exerciseId));

  const seconds =
    (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000;
  const sets = done.reduce((n, d) => n + d.sets.length, 0);
  const volume = totalVolume(
    done.filter((d) => (d.ex.exercise.tracking ?? "reps") === "reps").flatMap((d) => d.sets),
  );

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-[18px]">
      <Card className="relative overflow-hidden">
        <Eyebrow className="text-accent">Session complete</Eyebrow>
        <h1 className="mt-2 text-[26px] leading-[1.15] font-extrabold tracking-[-0.03em]">
          {session.title ?? session.day?.name ?? "Workout"}
        </h1>
        <p className="mt-1 font-mono text-[11px] text-fg-dim uppercase">
          {format(parseISO(session.started_at), "EEEE · MMM d · HH:mm")}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
        <StatCard label="Duration" value={formatDuration(seconds)} />
        <StatCard label="Sets" value={String(sets)} unit="done" />
        <StatCard
          label="Volume"
          value={volume > 0 ? formatVolume(volume, system) : "—"}
          unit={volume > 0 ? unit : undefined}
        />
        <StatCard
          label="Records"
          value={String(records.length)}
          tone={records.length ? "accent" : "dim"}
          delta={
            records.length
              ? // Opened from History, "today" would be wrong.
                sessionDay(session.started_at) === sessionDay(new Date().toISOString())
                ? "New bests today"
                : "New bests that day"
              : "No new bests — that's most days"
          }
        />
      </div>

      {records.length ? (
        <Card className="flex flex-col gap-3">
          <Eyebrow>New bests</Eyebrow>
          {records.map((r) => (
            <div key={r.exerciseId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rounded-[3px] bg-accent px-1 py-0.5 font-mono text-[9px] font-extrabold text-[#0a0c0d]">
                PR
              </span>
              <span className="text-[14px] font-bold">{r.name}</span>
              <span className="font-mono text-[12px] text-fg-muted">
                {r.kind === "hold"
                  ? `held ${formatDuration(r.value)} (was ${formatDuration(r.previous)})`
                  : r.kind === "load"
                    ? `${formatWeight(r.value, system)} ${unit} × ${r.set.reps} — heaviest yet (was ${formatWeight(r.previous, system)})`
                    : `${formatWeight(r.set.weight_kg, system)} ${unit} × ${r.set.reps} · est. 1RM ${formatWeight(r.value, system, 0)} (was ${formatWeight(r.previous, system, 0)})`}
              </span>
            </div>
          ))}
        </Card>
      ) : null}

      <WhatYouDid
        editable={
          own
            ? {
                exercises: session.exercises
                  .filter((ex) => ex.sets.length > 0)
                  .map((ex) => ({
                    id: ex.exercise.id,
                    name: ex.exercise.name,
                    tracking: ex.exercise.tracking ?? "reps",
                    sets: ex.sets,
                  })),
                system,
                effort: (settings?.effort_scale ?? "rpe") as EffortScale,
              }
            : null
        }
      >
        {done.length === 0 ? (
          <p className="text-[13px] text-fg-dim">No sets were ticked off in this session.</p>
        ) : (
          done.map(({ ex, sets: logged }) => {
            const tracking = ex.exercise.tracking ?? "reps";
            const top = bestSet(logged);
            const detail =
              tracking === "cardio"
                ? (() => {
                    const total = logged.reduce((n, s) => n + (s.duration_s ?? 0), 0);
                    const dist = logged.reduce((n, s) => n + (s.distance_m ?? 0), 0);
                    return [
                      total ? formatDuration(total) : null,
                      dist ? `${trimNumber(metresToDisplay(dist, system), 2)} ${distanceUnit(system)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                  })()
                : tracking === "time"
                  ? logged.map((s) => `${s.duration_s ?? 0}s`).join(" · ")
                  : top?.weight_kg
                    ? `top ${formatWeight(top.weight_kg, system)} ${unit} × ${top.reps}`
                    : `${logged.map((s) => s.reps ?? 0).join(" · ")} reps`;
            return (
              <div
                key={ex.exercise.id}
                className="flex items-baseline gap-3 border-b border-[#1a1e20] py-2.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                  {ex.exercise.name}
                  {recordIds.has(ex.exercise.id) ? (
                    <span className="ml-2 font-mono text-[9.5px] font-bold text-accent">PR</span>
                  ) : null}
                </span>
                <span className="flex-none font-mono text-[11px] text-fg-dim">
                  {logged.length} {logged.length === 1 ? "set" : "sets"}
                </span>
                <span className="flex-none font-mono text-[11.5px] text-fg-2">{detail}</span>
              </div>
            );
          })
        )}
      </WhatYouDid>

      {done.length ? (
        <Card>
          <MusclePreview
            title="What you trained"
            figure={(profile?.body_figure ?? "male") as BodyFigure}
            empty="Nothing counted — cardio is not working sets."
            load={muscleLoad(
              done
                .filter((d) => (d.ex.exercise.tracking ?? "reps") !== "cardio")
                .flatMap((d) =>
                  d.sets.map((s) => ({
                    primaryMuscle: d.ex.exercise.primary_muscle,
                    secondaryMuscles: d.ex.exercise.secondary_muscles,
                    rpe: s.rpe,
                  })),
                ),
            )}
          />
        </Card>
      ) : null}

      <SessionRating sessionId={session.id} rating={session.rating} note={session.notes} />

      <div className="flex flex-wrap gap-2.5">
        <Link
          href="/"
          className="rounded-[11px] bg-accent px-[22px] py-3 text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
        >
          Back to today
        </Link>
        <Link
          href="/progress"
          className="rounded-[11px] border border-stroke bg-ghost px-[22px] py-3 text-sm font-semibold text-fg-2 hover:bg-hover"
        >
          See your progress
        </Link>
        <Link
          href={`/history?month=${monthOf(parseISO(session.started_at))}&day=${sessionDay(session.started_at)}`}
          className="inline-flex items-center gap-1.5 rounded-[11px] border border-stroke bg-ghost px-[22px] py-3 text-sm font-semibold text-fg-2 hover:bg-hover"
        >
          <NavSpinner />
          All workouts
        </Link>
      </div>

      {own ? <DeleteWorkout sessionId={session.id} /> : null}
    </div>
  );
}

/**
 * The list of what was done. Its owner gets an Edit sets mode around it; a
 * coach reading an athlete's session gets the list alone.
 */
function WhatYouDid({
  editable,
  children,
}: {
  editable: Omit<React.ComponentProps<typeof EditableSets>, "children"> | null;
  children: React.ReactNode;
}) {
  if (editable) return <EditableSets {...editable}>{children}</EditableSets>;
  return (
    <Card className="flex flex-col gap-1">
      <Eyebrow className="mb-2">What you did</Eyebrow>
      {children}
    </Card>
  );
}
