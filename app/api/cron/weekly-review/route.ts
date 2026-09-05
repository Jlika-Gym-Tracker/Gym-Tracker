import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { subDays, startOfWeek, addWeeks } from "date-fns";
import type { Database } from "@/lib/database.types";
import { composeWeeklyReview } from "@/lib/email/weekly-review";
import { rollingAverage, type Metric } from "@/lib/body/stats";
import { toDateString, WEEK_STARTS_ON } from "@/lib/dates";

export const maxDuration = 60;

/**
 * Sunday weekly review. Triggered by pg_cron (see the migration) or any
 * scheduler that can send an authenticated POST.
 *
 * Runs with the service role because it reads every account, so it is gated on
 * a shared secret and refuses to run without one — an open endpoint here would
 * leak everybody's week.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; refusing to run." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SECRET_KEY is not configured." },
      { status: 503 },
    );
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const weekStart = toDateString(startOfWeek(subDays(new Date(), 1), { weekStartsOn: WEEK_STARTS_ON }));
  const nextWeekStart = toDateString(addWeeks(new Date(weekStart), 1));

  const { data: recipients, error } = await supabase
    .from("user_settings")
    .select("user_id, notify_weighin, notify_unpublished_week")
    .or("notify_weighin.eq.true,notify_unpublished_week.eq.true");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.WEEKLY_REVIEW_FROM ?? "JLIKA Gym <onboarding@resend.dev>";

  let sent = 0;
  const skipped: string[] = [];

  for (const recipient of recipients ?? []) {
    const userId = recipient.user_id;

    const [{ data: profile }, { data: authUser }, { data: sessions }, { data: metrics }, { data: weeks }] =
      await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
        supabase.auth.admin.getUserById(userId),
        supabase
          .from("workout_sessions")
          .select("id, started_at, set_logs ( weight_kg, reps, is_complete )")
          .eq("user_id", userId)
          .not("ended_at", "is", null)
          .gte("started_at", weekStart)
          .lt("started_at", nextWeekStart),
        supabase
          .from("body_metrics")
          .select("measured_on, weight_kg, waist_cm, chest_cm, arm_cm, thigh_cm, hip_cm, bodyfat_pct")
          .eq("user_id", userId)
          .order("measured_on", { ascending: false })
          .limit(30),
        supabase
          .from("program_weeks")
          .select("week_start, status")
          .eq("user_id", userId)
          .in("week_start", [weekStart, nextWeekStart]),
      ]);

    const email = authUser?.user?.email;
    if (!email || !profile) {
      skipped.push(userId);
      continue;
    }

    type SessionRow = {
      set_logs: { weight_kg: number | null; reps: number | null; is_complete: boolean }[];
    };
    const rows = (sessions ?? []) as unknown as SessionRow[];
    const completedSets = rows.flatMap((s) => s.set_logs.filter((l) => l.is_complete));

    const history = (metrics ?? []) as Metric[];
    const thisWeekAvg = rollingAverage(history, "weight_kg", 7);
    const lastWeekAvg = rollingAverage(history, "weight_kg", 7, toDateString(subDays(new Date(weekStart), 1)));

    const composed = composeWeeklyReview({
      displayName: profile.display_name,
      sessionsDone: rows.length,
      sessionsPlanned:
        (weeks ?? []).find((w) => w.week_start === weekStart)?.status === "published" ? 4 : 0,
      setsCompleted: completedSets.length,
      volumeKg: completedSets.reduce(
        (sum, s) => sum + Number(s.weight_kg ?? 0) * (s.reps ?? 0),
        0,
      ),
      weightChangeKg:
        thisWeekAvg != null && lastWeekAvg != null
          ? Number((thisWeekAvg - lastWeekAvg).toFixed(1))
          : null,
      nextWeekPublished:
        (weeks ?? []).some((w) => w.week_start === nextWeekStart && w.status === "published"),
    });

    if (!resendKey) {
      skipped.push(email);
      continue;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
      }),
    });
    if (response.ok) sent++;
    else skipped.push(email);
  }

  return NextResponse.json({
    weekStart,
    considered: recipients?.length ?? 0,
    sent,
    skipped: skipped.length,
    note: resendKey ? undefined : "RESEND_API_KEY not set — nothing was sent.",
  });
}
