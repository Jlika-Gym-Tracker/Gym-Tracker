import { NextResponse, type NextRequest } from "next/server";
import { adminClient, NOT_CONFIGURED, pushConfig, sendPush, type Deliverable } from "@/lib/push/server";
import {
  isReminderHour, reminderText, selectReminders,
  type ReminderCandidate, type ReminderWeek,
} from "@/lib/push/reminder";

export const maxDuration = 60;

/** `.in()` lists go in the query string; this keeps each request a sane length. */
const IDS_PER_QUERY = 100;
const PAGE = 1000;

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/**
 * Hourly workout-day reminder. Triggered by pg_cron (see the migration) or any
 * scheduler that can send an authenticated POST.
 *
 * Runs with the service role because it reads every account, so like the
 * weekly review it is gated on CRON_SECRET and refuses to run without one.
 * Who actually gets reminded is decided by selectReminders, which is pure and
 * tested; this only gathers what it needs and delivers.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured; refusing to run." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = pushConfig();
  if (!config) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  const admin = adminClient(config);
  const now = new Date();

  // Everyone who asked for the reminder and whose hour it is, in their zone.
  const opted: { user_id: string; timezone: string; reminder_hour: number }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("user_settings")
      .select("user_id, timezone, reminder_hour")
      .eq("notify_workout_day", true)
      .order("user_id")
      .range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    opted.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const due = opted.filter((s) => isReminderHour(now, s.timezone, s.reminder_hour));
  if (due.length === 0) return NextResponse.json({ considered: opted.length, due: 0, sent: 0 });

  // Today is within a day of UTC's today everywhere, so this window holds
  // every week that could contain anyone's today.
  const utcDay = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const earliestWeek = utcDay(-8);
  const latestWeek = utcDay(1);
  const since = new Date(now.getTime() - 36 * 3600_000).toISOString();

  const subscriptions = new Map<string, Deliverable[]>();
  const weeks = new Map<string, ReminderWeek[]>();
  const sessions = new Map<string, string[]>();

  for (const ids of chunk(due.map((d) => d.user_id), IDS_PER_QUERY)) {
    const [subs, weekRows, sessionRows] = await Promise.all([
      admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids),
      admin
        .from("program_weeks")
        .select("user_id, week_start, status, program_days ( day_index, name, is_rest, program_exercises ( count ) )")
        .in("user_id", ids)
        .eq("status", "published")
        .gte("week_start", earliestWeek)
        .lte("week_start", latestWeek),
      admin.from("workout_sessions").select("user_id, started_at").in("user_id", ids).gte("started_at", since),
    ]);
    const failed = subs.error ?? weekRows.error ?? sessionRows.error;
    if (failed) return NextResponse.json({ error: failed.message }, { status: 500 });

    for (const s of subs.data ?? []) {
      subscriptions.set(s.user_id, [...(subscriptions.get(s.user_id) ?? []), s]);
    }

    // lib/database.types.ts is hand-maintained and declares no Relationships,
    // so embedded selects cannot be inferred. Cast at the boundary, once.
    type WeekRow = {
      user_id: string;
      week_start: string;
      status: string;
      program_days: { day_index: number; name: string; is_rest: boolean; program_exercises: { count: number }[] }[];
    };
    for (const w of (weekRows.data ?? []) as unknown as WeekRow[]) {
      weeks.set(w.user_id, [
        ...(weeks.get(w.user_id) ?? []),
        {
          weekStart: w.week_start,
          status: w.status,
          days: w.program_days.map((d) => ({
            dayIndex: d.day_index,
            name: d.name,
            isRest: d.is_rest,
            exerciseCount: d.program_exercises[0]?.count ?? 0,
          })),
        },
      ]);
    }

    for (const s of sessionRows.data ?? []) {
      sessions.set(s.user_id, [...(sessions.get(s.user_id) ?? []), s.started_at]);
    }
  }

  const candidates: ReminderCandidate[] = due
    .filter((d) => subscriptions.has(d.user_id))
    .map((d) => ({
      userId: d.user_id,
      timezone: d.timezone,
      reminderHour: d.reminder_hour,
      weeks: weeks.get(d.user_id) ?? [],
      sessionStarts: sessions.get(d.user_id) ?? [],
    }));

  let sent = 0;
  const gone: string[] = [];
  for (const reminder of selectReminders(now, candidates)) {
    const result = await sendPush(
      config,
      subscriptions.get(reminder.userId) ?? [],
      { ...reminderText(reminder.dayName), url: "/", tag: "workout-day" },
      // Still worth seeing a couple of hours late; not tomorrow.
      { ttl: 3 * 3600, urgency: "normal", topic: "workout-day" },
    );
    if (result.sent > 0) sent++;
    gone.push(...result.gone);
  }
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);

  return NextResponse.json({ considered: opted.length, due: candidates.length, sent, removed: gone.length });
}
