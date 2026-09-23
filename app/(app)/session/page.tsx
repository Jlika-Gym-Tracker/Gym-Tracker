import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getActiveSessionId } from "@/lib/training/queries";
import { currentWeekStart } from "@/lib/dates";
import { getWeek } from "@/lib/program/queries";
import { StartSessionButton } from "@/components/session/start-session-button";
import { Card, Eyebrow } from "@/components/kit/card";
import { NavSpinner } from "@/components/shell/nav-spinner";

/** No id in the URL: resume what is open, or offer today's planned day. */
export default async function SessionIndexPage() {
  const active = await getActiveSessionId();
  if (active) redirect(`/session/${active}`);

  const supabase = await createClient();
  const [week, { data: recent }] = await Promise.all([
    getWeek(currentWeekStart()),
    supabase
      .from("workout_sessions")
      .select("id, title, started_at, ended_at")
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(5),
  ]);

  const trainingDays = week?.days.filter((d) => !d.is_rest && d.exercises.length > 0) ?? [];

  return (
    <div className="flex max-w-[860px] flex-col gap-[18px]">
      <Card>
        <Eyebrow>Start a session</Eyebrow>
        {trainingDays.length === 0 ? (
          <>
            <h1 className="display mt-3 text-[30px]">No training days planned.</h1>
            <p className="mt-2 max-w-[440px] text-[13.5px] leading-[1.55] text-fg-muted">
              Write this week in the program builder first, then start a session from
              any of its days.
            </p>
            <Link
              href="/program"
              className="inline-flex items-center gap-1.5 mt-6 inline-block rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
            >
              <NavSpinner />
              Open program builder
            </Link>
          </>
        ) : (
          <>
            <h1 className="display mt-3 text-[30px]">Which day are you training?</h1>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {trainingDays.map((day) => (
                <StartSessionButton
                  key={day.id}
                  dayId={day.id}
                  name={day.name}
                  meta={`${day.exercises.length} exercises · ${day.exercises.reduce((n, e) => n + e.target_sets, 0)} sets`}
                />
              ))}
            </div>
            <StartSessionButton name="Free session" meta="No plan — log as you go" freeform />
          </>
        )}
      </Card>

      {recent?.length ? (
        <Card>
          <Eyebrow>Recent sessions</Eyebrow>
          <ul className="mt-3 flex flex-col">
            {recent.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 border-b border-[#1a1e20] py-2.5 last:border-0"
              >
                <span className="font-mono text-[11px] text-fg-dim">
                  {format(parseISO(s.started_at), "MMM dd")}
                </span>
                <span className="text-[13px] font-semibold">{s.title ?? "Session"}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
