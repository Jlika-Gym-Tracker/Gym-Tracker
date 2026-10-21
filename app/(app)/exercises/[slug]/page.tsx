import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { BodyFigure, EffortScale, Muscle, Tracking, UnitSystem } from "@/lib/database.types";
import { countPlannedDays, getExercise, getExerciseSets, getPlannableWeeks } from "@/lib/exercises/queries";
import { exerciseStats, type ExerciseSet, type ExerciseStats } from "@/lib/exercises/stats";
import { MUSCLE_LABEL, TRACKING_LABEL, equipmentLabel } from "@/lib/exercises/taxonomy";
import { E1RM_REP_CAP } from "@/lib/training/e1rm";
import { effortDisplayScale } from "@/lib/training/effort-stats";
import { muscleLoad, normaliseMuscle } from "@/lib/training/muscle-load";
import { formatDuration, formatWeight, kgToDisplay, metresToDisplay, distanceUnit, trimNumber, weightUnit } from "@/lib/units";
import { Card } from "@/components/kit/card";
import { MuscleMap } from "@/components/stats/muscle-map";
import { E1rmCurve } from "@/components/exercises/e1rm-curve";
import { AddToDay } from "@/components/exercises/add-to-day";
import { OneRepMaxCalculator } from "@/components/exercises/one-rep-max-calculator";
import { OwnerTools } from "@/components/exercises/owner-tools";

/**
 * One movement: what it works and how to do it, and — from your own sets
 * only — your best, your estimated-1RM curve and your last sessions of it.
 */
export default async function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const exercise = await getExercise(supabase, user.id, slug);
  if (!exercise) notFound();
  const own = exercise.owner_id === user.id;
  const archived = Boolean(exercise.archived_at);

  const [{ data: profile }, { data: settings }, sets, weeks, plannedDays] = await Promise.all([
    supabase.from("profiles").select("unit_system, body_figure").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("effort_scale").eq("user_id", user.id).maybeSingle(),
    getExerciseSets(supabase, user.id, exercise.id),
    archived ? Promise.resolve([]) : getPlannableWeeks(supabase, user.id, exercise.id, new Date()),
    own && !archived ? countPlannedDays(supabase, user.id, exercise.id) : Promise.resolve(0),
  ]);

  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const figure = (profile?.body_figure ?? "male") as BodyFigure;
  const tracking: Tracking = exercise.tracking ?? "reps";
  const stats = exerciseStats(sets);
  const effortScale = effortDisplayScale(
    (settings?.effort_scale ?? "rpe") as EffortScale,
    stats.curve.some((p) => p.rpe != null),
  );

  const secondary = [
    ...new Set(
      exercise.secondary_muscles
        .map(normaliseMuscle)
        .filter((m): m is Muscle => m != null && m !== exercise.primary_muscle),
    ),
  ];
  const load = muscleLoad([{ primaryMuscle: exercise.primary_muscle, secondaryMuscles: secondary }]);
  const hero = exercise.image_end_url ?? exercise.image_start_url;

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-[18px]">
      <Link
        href="/exercises"
        className="hit inline-flex w-fit items-center gap-1.5 font-mono text-[10.5px] font-semibold text-fg-dim uppercase hover:text-accent"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />
        All exercises
      </Link>

      {archived ? (
        <p className="rounded-[14px] border border-line-hi bg-accent-soft px-4 py-3 text-[12.5px] leading-[1.5] text-fg-2">
          You removed this from your library on {format(parseISO(exercise.archived_at!), "MMM d, yyyy")}. It
          stays in your history and in plans written before then, but no longer appears in the pickers.
        </p>
      ) : null}

      <Card className="overflow-hidden rounded-[18px] p-0">
        <div className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="relative aspect-[16/10] bg-surface-2 md:aspect-auto md:min-h-[260px]">
            {hero ? (
              // Hotlinked from the public-domain free-exercise-db; see README "Imagery".
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt={exercise.name} className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-fg-dim">
                NO DEMO IMAGE
              </div>
            )}
          </div>
          <div className="flex gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {own ? <Tag accent>YOURS</Tag> : exercise.featured ? <Tag accent>FEATURED</Tag> : null}
                <Tag>{equipmentLabel(exercise.equipment).toUpperCase()}</Tag>
                {tracking !== "reps" ? <Tag>{TRACKING_LABEL[tracking].toUpperCase()}</Tag> : null}
              </div>
              <h2 className="mt-3 text-[21px] leading-[1.15] font-extrabold tracking-[-0.03em] break-words sm:text-[24px]">
                {exercise.name}
              </h2>
              <dl className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
                <div className="flex gap-2">
                  <dt className="w-[74px] flex-none font-mono text-[10px] leading-[1.9] text-fg-dim uppercase">Primary</dt>
                  <dd className="font-semibold text-accent">{MUSCLE_LABEL[exercise.primary_muscle]}</dd>
                </div>
                {secondary.length ? (
                  <div className="flex gap-2">
                    <dt className="w-[74px] flex-none font-mono text-[10px] leading-[1.9] text-fg-dim uppercase">Also</dt>
                    <dd className="text-fg-muted">{secondary.map((m) => MUSCLE_LABEL[m]).join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <MuscleMap load={load} figure={figure} size="sm" className="mx-0 w-[96px] flex-none sm:w-[132px]" />
          </div>
        </div>
      </Card>

      <YourNumbers stats={stats} tracking={tracking} system={system} effortScale={effortScale} />

      {/* The two tools sit side by side from tablet width up. */}
      {!archived || tracking === "reps" ? (
        <div className="grid items-start gap-[18px] md:grid-cols-2">
          {archived ? null : <AddToDay exerciseId={exercise.id} weeks={weeks} />}
          {tracking === "reps" ? (
            <OneRepMaxCalculator
              system={system}
              initial={
                stats.bestSet && stats.bestSet.reps <= E1RM_REP_CAP
                  ? {
                      weight: Number(kgToDisplay(stats.bestSet.weightKg, system).toFixed(1)),
                      reps: stats.bestSet.reps,
                    }
                  : undefined
              }
            />
          ) : null}
        </div>
      ) : null}

      <LastSessions stats={stats} tracking={tracking} system={system} />

      <HowTo exercise={exercise} />

      {own && !archived ? (
        <OwnerTools
          exerciseId={exercise.id}
          draft={{
            name: exercise.name,
            primaryMuscle: exercise.primary_muscle,
            equipment: exercise.equipment,
            tracking,
            description: exercise.how_to.join("\n"),
          }}
          loggedSets={stats.sets}
          plannedDays={plannedDays}
        />
      ) : null}
    </div>
  );
}

function YourNumbers({
  stats,
  tracking,
  system,
  effortScale,
}: {
  stats: ExerciseStats;
  tracking: Tracking;
  system: UnitSystem;
  effortScale: "rpe" | "rir" | null;
}) {
  const unit = weightUnit(system);
  return (
    <Card className="rounded-[18px]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-[15px] font-bold">Your numbers</h3>
        {stats.sessions ? (
          <span className="ml-auto font-mono text-[10.5px] text-fg-dim uppercase">
            {stats.sessions} {stats.sessions === 1 ? "session" : "sessions"} · {stats.sets}{" "}
            {stats.sets === 1 ? "set" : "sets"}
          </span>
        ) : null}
      </div>
      {stats.sessions === 0 ? (
        <p className="mt-3 text-[13px] leading-[1.55] text-fg-dim">
          Not logged yet. Your best, your curve and your last sessions of it show up here once you do.
        </p>
      ) : (
        <>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {tracking === "reps" ? (
              <>
                <Tile
                  label="Best set"
                  value={stats.bestSet ? `${formatWeight(stats.bestSet.weightKg, system)} × ${stats.bestSet.reps}` : "—"}
                  unit={stats.bestSet ? unit : undefined}
                />
                {/* An estimate names its source: the best set beside it. */}
                <Tile
                  label="Est. 1RM"
                  value={stats.e1rmKg > 0 ? formatWeight(stats.e1rmKg, system, 0) : "—"}
                  unit={stats.e1rmKg > 0 ? unit : undefined}
                />
                <Tile
                  label="Heaviest"
                  value={stats.heaviestKg > 0 ? formatWeight(stats.heaviestKg, system) : "—"}
                  unit={stats.heaviestKg > 0 ? unit : undefined}
                />
              </>
            ) : tracking === "time" ? (
              <>
                <Tile label="Longest hold" value={stats.longestS ? formatDuration(stats.longestS) : "—"} />
                {stats.heaviestKg > 0 ? (
                  <Tile label="Heaviest load" value={formatWeight(stats.heaviestKg, system)} unit={unit} />
                ) : null}
              </>
            ) : (
              <>
                <Tile label="Longest session" value={stats.longestS ? formatDuration(stats.longestS) : "—"} />
                <Tile
                  label="Farthest"
                  value={stats.farthestM ? trimNumber(metresToDisplay(stats.farthestM, system), 2) : "—"}
                  unit={stats.farthestM ? distanceUnit(system) : undefined}
                />
              </>
            )}
          </div>
          {tracking === "reps" && stats.curve.length ? (
            <div className="mt-5 border-t border-line pt-4">
              <E1rmCurve points={stats.curve} system={system} effortScale={effortScale} />
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function LastSessions({
  stats,
  tracking,
  system,
}: {
  stats: ExerciseStats;
  tracking: Tracking;
  system: UnitSystem;
}) {
  if (!stats.recent.length) return null;
  return (
    <Card className="rounded-[18px]">
      <h3 className="text-[15px] font-bold">Last sessions</h3>
      <ol className="mt-3 flex flex-col divide-y divide-line">
        {stats.recent.map((session) => (
          <li key={session.sessionId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="flex-none font-mono text-[11px] font-semibold text-fg-2 uppercase">
                {format(parseISO(session.date), "EEE d MMM yyyy")}
              </span>
              {session.title ? <span className="truncate text-[11.5px] text-fg-dim">{session.title}</span> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {session.sets.map((set, i) => (
                <span
                  key={i}
                  className="rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] text-fg-muted"
                >
                  {describeSet(set, tracking, system)}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function describeSet(set: ExerciseSet, tracking: Tracking, system: UnitSystem): string {
  const load = set.weightKg ? `${formatWeight(set.weightKg, system)} ${weightUnit(system)}` : null;
  if (tracking === "time") {
    const held = set.durationS != null ? formatDuration(set.durationS) : "—";
    return load ? `${held} · ${load}` : held;
  }
  if (tracking === "cardio") {
    const minutes = set.durationS != null ? formatDuration(set.durationS) : "—";
    const distance = set.distanceM
      ? ` · ${trimNumber(metresToDisplay(set.distanceM, system), 2)} ${distanceUnit(system)}`
      : "";
    return `${minutes}${distance}`;
  }
  const reps = set.reps ?? 0;
  const rpe = set.rpe != null ? ` @${trimNumber(set.rpe)}` : "";
  return `${load ?? "BW"} × ${reps}${rpe}`;
}

function HowTo({
  exercise,
}: {
  exercise: NonNullable<Awaited<ReturnType<typeof getExercise>>>;
}) {
  const photos = exercise.image_start_url && exercise.image_end_url;
  if (!exercise.how_to.length && !photos && !exercise.cues.length && !exercise.common_mistake) return null;

  return (
    <Card className="rounded-[18px]">
      <h3 className="text-[15px] font-bold">How to do it</h3>
      {exercise.how_to.length ? (
        <ol className="mt-3.5 flex flex-col gap-3">
          {exercise.how_to.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex size-[26px] flex-none items-center justify-center rounded-lg border border-line-hi bg-accent-soft font-mono text-[11px] font-bold text-accent">
                {i + 1}
              </span>
              <span className="text-[13px] leading-[1.6] whitespace-pre-line text-[#c2ccc6]">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {photos ? (
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {(
            [
              ["Start", exercise.image_start_url!],
              ["End", exercise.image_end_url!],
            ] as const
          ).map(([label, src]) => (
            <figure key={label} className="overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`${exercise.name} — ${label.toLowerCase()} position`} loading="lazy" className="aspect-square w-full object-cover" />
              <figcaption className="eyebrow px-3 py-2">{label} position</figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {exercise.cues.length ? (
        <div className="mt-5">
          <div className="eyebrow mb-3">Cues</div>
          <ul className="flex flex-col gap-2.5">
            {exercise.cues.map((cue, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-[7px] size-[6px] flex-none rounded-[2px] bg-accent" />
                <span className="text-[12.5px] leading-[1.5] text-fg-muted">{cue}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {exercise.common_mistake ? (
        <div className="mt-5 rounded-[14px] border border-line-hi bg-accent-soft px-[18px] py-4">
          <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">
            Common mistake
          </div>
          <p className="mt-2 text-[13px] leading-[1.55] text-[#dfe7d5]">{exercise.common_mistake}</p>
        </div>
      ) : null}
    </Card>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-3.5">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="truncate font-mono text-base font-extrabold">{value}</span>
        {unit ? <span className="text-[11px] text-fg-soft">{unit}</span> : null}
      </div>
    </div>
  );
}

function Tag({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={
        accent
          ? "rounded-md border border-line-hi bg-accent-soft px-[7px] py-[3px] font-mono text-[9.5px] font-bold tracking-[0.08em] text-accent"
          : "rounded-md border border-line px-[7px] py-[3px] font-mono text-[9.5px] font-bold tracking-[0.08em] text-fg-soft"
      }
    >
      {children}
    </span>
  );
}
