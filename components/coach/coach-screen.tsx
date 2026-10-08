"use client";

import { useActionState, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, X } from "lucide-react";
import {
  addCoachProgramExercise,
  assignProgram,
  createCoachInvite,
  createCoachProgram,
  deleteCoachProgram,
  endCoachLink,
  removeCoachProgramExercise,
  type ActionState,
} from "@/app/actions/coach";
import type { CoachProgramDetail } from "@/lib/coach/queries";
import type { CoachInvite, RosterAthlete } from "@/lib/database.types";
import type { LibraryExercise } from "@/lib/program/match";
import { findCandidates } from "@/lib/program/match";
import { DAY_NAMES, weekRangeLabel } from "@/lib/dates";
import { Card } from "@/components/kit/card";
import { AvatarBubble } from "@/components/shell/avatar-bubble";
import { ExerciseThumb } from "@/components/program/exercise-thumb";
import { Message } from "@/components/profile/controls";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/kit/action-button";
import { AsyncButton } from "@/components/kit/async-button";

export function CoachScreen({
  roster,
  programs,
  invites,
  library,
  meId,
  weekStart,
}: {
  roster: RosterAthlete[];
  programs: CoachProgramDetail[];
  invites: CoachInvite[];
  library: LibraryExercise[];
  meId: string;
  /** The coach's own current week, resolved on the server from their setting. */
  weekStart: string;
}) {
  const [inviteState, invite] = useActionState(createCoachInvite, {} as ActionState);
  const [assignState, assign] = useActionState(assignProgram, {} as ActionState);
  const [createState, create] = useActionState(createCoachProgram, {} as ActionState);
  const [endState, end] = useActionState(endCoachLink, {} as ActionState);

  const active = roster.filter((a) => a.sessions_this_week > 0).length;
  const behind = roster.filter(
    (a) => a.planned_this_week > 0 && a.sessions_this_week < a.planned_this_week,
  ).length;

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex flex-wrap items-center gap-7">
        <div className="min-w-0">
          <div className="eyebrow">Coaching</div>
          <h1 className="display mt-2 text-[30px]">
            {roster.length === 0
              ? "No athletes yet."
              : `${roster.length} ${roster.length === 1 ? "athlete" : "athletes"}.`}
          </h1>
          <p className="mt-2 max-w-[460px] text-[13px] leading-[1.55] text-fg-muted">
            You see each athlete&apos;s programme and what they logged. Bodyweight,
            photos and nutrition stay hidden unless they choose to share them —
            and they can revoke any of it at any time.
          </p>
        </div>
        <div className="ml-auto flex gap-7">
          {[
            ["Trained this week", active],
            ["Behind plan", behind],
            ["Programs", programs.length],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="eyebrow">{label}</div>
              <div className="mt-1 font-mono text-2xl font-extrabold">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Card className="rounded-[18px]">
            <h2 className="mb-3.5 text-[15px] font-bold">Athletes</h2>
            {roster.length === 0 ? (
              <p className="py-8 text-center text-[13px] leading-[1.55] text-fg-dim">
                Share a coach code and athletes appear here once they join.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {roster.map((athlete) => {
                  const behindPlan =
                    athlete.planned_this_week > 0 &&
                    athlete.sessions_this_week < athlete.planned_this_week;
                  return (
                    <div
                      key={athlete.athlete_id}
                      className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-surface-2 p-3"
                    >
                      <AvatarBubble
                        name={athlete.display_name}
                        src={athlete.avatar_url}
                        size={36}
                      />
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold">
                          {athlete.display_name}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-fg-dim uppercase">
                          {athlete.goal}
                          {athlete.last_session_at
                            ? ` · last ${format(parseISO(athlete.last_session_at), "MMM dd")}`
                            : " · never logged"}
                        </div>
                      </div>

                      <div className="ml-auto flex items-center gap-4">
                        {/* Calendar Mon–Sun: coach_roster() counts by ISO weekday,
                            and athletes may each start their week on a different day. */}
                        <div className="flex gap-1">
                          {DAY_NAMES.map((day, i) => (
                            <span
                              key={day}
                              title={day}
                              className={cn(
                                "size-2.5 rounded-[2px]",
                                athlete.week_dots?.includes(i) ? "bg-accent" : "bg-line",
                              )}
                            />
                          ))}
                        </div>
                        <div
                          className={cn(
                            "font-mono text-[11px] font-semibold",
                            behindPlan ? "text-warn" : "text-accent",
                          )}
                        >
                          {athlete.sessions_this_week}/{athlete.planned_this_week || "—"}
                        </div>
                        <div className="font-mono text-[10px] text-fg-dim">
                          {athlete.sets_this_week} SETS
                        </div>

                        {/* What this athlete has chosen to share, stated plainly. */}
                        <div className="flex gap-1">
                          {[
                            ["BODY", athlete.shares_body],
                            ["PHOTOS", athlete.shares_photos],
                            ["FOOD", athlete.shares_nutrition],
                          ].map(([label, on]) => (
                            <span
                              key={String(label)}
                              className={cn(
                                "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold",
                                on
                                  ? "bg-accent-soft text-accent"
                                  : "bg-surface text-fg-faint line-through",
                              )}
                            >
                              {label}
                            </span>
                          ))}
                        </div>

                        {programs.length > 0 ? (
                          <form action={assign} className="flex items-center gap-1.5">
                            <input type="hidden" name="athleteId" value={athlete.athlete_id} />
                            <input type="hidden" name="weekStart" value={weekStart} />
                            <select
                              name="programId"
                              aria-label={`Program to assign to ${athlete.display_name}`}
                              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[11.5px] outline-none focus:border-line-hi"
                            >
                              {programs.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <ActionButton className="rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-bold text-[#0a0c0d] hover:bg-accent-hi">
                              Assign
                            </ActionButton>
                          </form>
                        ) : null}

                        <form action={end}>
                          <input type="hidden" name="coachId" value={meId} />
                          <input type="hidden" name="athleteId" value={athlete.athlete_id} />
                          <ActionButton
                spinnerOnly
                            className="rounded p-1 text-fg-faint hover:text-danger"
                            aria-label={`Stop coaching ${athlete.display_name}`}
                          >
                            <X className="size-3.5" strokeWidth={2} />
                          </ActionButton>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3">
              <Message error={assignState.error ?? endState.error} notice={assignState.notice ?? endState.notice} />
            </div>
            {roster.length > 0 ? (
              <p className="mt-3 font-mono text-[10px] text-fg-dim uppercase">
                Assigning writes the week of {weekRangeLabel(weekStart)}
              </p>
            ) : null}
          </Card>

          <ProgramLibrary
            programs={programs}
            library={library}
            create={create}
            createState={createState}
          />
        </div>

        <Card className="rounded-[18px]">
          <h2 className="text-[15px] font-bold">Invite athletes</h2>
          <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-fg-soft">
            Send the link — it names you, explains what you will see, and applies
            the code even if they have no account yet. Each code works ten times
            and lasts thirty days, and joining shares their training and nothing
            else.
          </p>
          <form action={invite} className="flex flex-col gap-2.5">
            <input
              name="label"
              placeholder="Autumn intake (optional)"
              className="rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] outline-none focus:border-line-hi"
            />
            <ActionButton
            pendingLabel="Creating…" className="rounded-[11px] bg-accent px-4 py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi">
              Create a coach code
            </ActionButton>
          </form>
          <div className="mt-3">
            <Message error={inviteState.error} notice={inviteState.notice} />
          </div>

          {invites.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {invites.map((code) => (
                <InviteRow key={code.code} invite={code} />
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/**
 * One code, with the link that actually gets sent.
 *
 * The origin is read on the client because a coach may be on localhost, a
 * preview deploy or the real domain, and the link has to work where they are.
 */
function InviteRow({ invite }: { invite: CoachInvite }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/join/${invite.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused; the code is on screen to type.
    }
  }

  return (
    <div className="rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-bold text-accent">
          {invite.code}
        </span>
        <span className="ml-auto font-mono text-[10px] text-fg-dim">
          {invite.uses_left} LEFT · {format(parseISO(invite.expires_at), "MMM dd")}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-fg-dim">
          /join/{invite.code}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex-none rounded-[8px] border border-stroke bg-ghost px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.08em] text-fg-muted uppercase hover:bg-hover"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {invite.label ? (
        <div className="mt-1.5 text-[11px] text-fg-dim">{invite.label}</div>
      ) : null}
    </div>
  );
}

function ProgramLibrary({
  programs,
  library,
  create,
  createState,
}: {
  programs: CoachProgramDetail[];
  library: LibraryExercise[];
  create: (formData: FormData) => void;
  createState: ActionState;
}) {
  const [openId, setOpenId] = useState<string | null>(programs[0]?.id ?? null);
  const [deleteState, remove] = useActionState(deleteCoachProgram, {} as ActionState);
  const open = programs.find((p) => p.id === openId);

  return (
    <Card className="rounded-[18px]">
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-bold">Your programs</h2>
        <form action={create} className="ml-auto flex gap-2">
          <input
            name="name"
            required
            minLength={2}
            placeholder="New program name"
            className="rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] outline-none focus:border-line-hi"
          />
          <ActionButton className="rounded-[10px] border border-stroke bg-ghost px-3.5 py-2 text-[12.5px] font-semibold text-fg-2 hover:bg-hover">
            Create
          </ActionButton>
        </form>
      </div>
      <Message error={createState.error ?? deleteState.error} notice={createState.notice ?? deleteState.notice} />

      {programs.length === 0 ? (
        <p className="py-8 text-center text-[13px] leading-[1.55] text-fg-dim">
          Write a program once, assign it to as many athletes as you like.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {programs.map((program) => (
              <button
                key={program.id}
                type="button"
                onClick={() => setOpenId(program.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  openId === program.id
                    ? "border-line-sel bg-accent-soft text-accent"
                    : "border-line bg-surface-2 text-fg-soft hover:border-stroke",
                )}
              >
                {program.name}
              </button>
            ))}
          </div>

          {open ? (
            <div className="mt-4">
              <div className="mb-2.5 flex items-center">
                <span className="eyebrow">
                  {open.days.reduce((n, d) => n + d.exercises.length, 0)} exercises
                </span>
                <form action={remove} className="ml-auto">
                  <input type="hidden" name="programId" value={open.id} />
                  <ActionButton className="flex items-center gap-1.5 font-mono text-[10px] text-fg-dim uppercase hover:text-danger">
                    <Trash2 className="size-3" strokeWidth={2} />
                    Delete program
                  </ActionButton>
                </form>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {open.days.map((day) => (
                  <CoachDayCard key={day.id} day={day} library={library} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function CoachDayCard({
  day,
  library,
}: {
  day: CoachProgramDetail["days"][number];
  library: LibraryExercise[];
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const results = query.trim().length >= 2
    ? findCandidates(query, library, 6).map((c) => c.exercise)
    : [];

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface-2">
      <header className="flex items-center gap-2.5 border-b border-[#1a1e20] px-3.5 py-3">
        <span className="font-mono text-[10px] font-bold tracking-[0.12em] text-accent">
          {/* A coach program is a template, not a dated week: label by position. */}
          DAY {day.day_index + 1}
        </span>
        <span className="text-[13.5px] font-bold">{day.name}</span>
        <span className="ml-auto font-mono text-[10px] text-fg-dim">
          {day.exercises.length} EX
        </span>
      </header>

      <div className="px-2.5 py-2">
        {day.exercises.map((item) => (
          <div key={item.id} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-[#15191b]">
            <ExerciseThumb
              src={item.exercise.image_start_url}
              muscle={item.exercise.primary_muscle}
              size={26}
            />
            <span className="min-w-0 truncate text-[12px] font-semibold">
              {item.exercise.name}
            </span>
            <span className="ml-auto font-mono text-[10.5px] text-fg-soft">
              {item.target_sets} × {item.rep_min}
              {item.rep_max && item.rep_max !== item.rep_min ? `-${item.rep_max}` : ""}
            </span>
            <AsyncButton
              aria-label={`Remove ${item.exercise.name}`}
              action={() => removeCoachProgramExercise(item.id)}
              spinner="replace"
              className="rounded p-0.5 text-fg-faint opacity-0 group-hover:opacity-100 hover:text-danger pointer-coarse:opacity-100"
            >
              <X className="size-3" strokeWidth={2} />
            </AsyncButton>
          </div>
        ))}

        {adding ? (
          <div className="mt-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movements…"
              aria-label={`Add an exercise to ${day.name}`}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-line-hi"
            />
            <div className="mt-1.5 flex flex-col gap-1">
              {results.map((exercise) => (
                <AsyncButton
                  key={exercise.id}
                  action={async () => {
                    await addCoachProgramExercise(day.id, exercise.id);
                    setQuery("");
                    setAdding(false);
                  }}
                  className="flex items-center gap-2 rounded-lg border border-[#171b1d] p-1.5 text-left hover:border-line-hi"
                >
                  <ExerciseThumb
                    src={exercise.image_start_url}
                    muscle={exercise.primary_muscle}
                    size={22}
                  />
                  <span className="truncate text-[12px]">{exercise.name}</span>
                </AsyncButton>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stroke py-1.5 text-[11.5px] font-semibold text-fg-dim hover:border-accent hover:text-accent"
          >
            <Plus className="size-3" strokeWidth={2} />
            Add exercise
          </button>
        )}
      </div>
    </div>
  );
}
