import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deliverRestAlert, pushConfig } from "@/lib/push/server";

/**
 * The longest rest this route will wait out. It must stay under maxDuration
 * with room to send; lib/push/rest-alert.ts skips longer rests to match.
 */
const MAX_WAIT_MS = 280_000;

/**
 * Hosting constraint: this function stays alive for the whole rest. It answers
 * at once, then `after()` keeps the invocation running until the rest is over
 * so it can send the push. 300 s is what common serverless plans accept (a
 * higher value can fail the deploy on a plan that caps lower), so rests longer
 * than MAX_WAIT_MS get no background push — the in-app chime still sounds.
 * On a plain `next start` server, or a plan that allows longer functions,
 * raise both numbers together (and MAX_PUSH_REST_MS in rest-alert.ts).
 * Each reschedule leaves the earlier invocation sleeping until its own end
 * time, when it finds itself replaced and exits — billed time, which is the
 * price of not running a separate job queue.
 */
export const maxDuration = 300;

const scheduleSchema = z.object({
  /** Milliseconds from now, measured on the phone: its clock and ours needn't agree. */
  delayMs: z.number().min(0).max(MAX_WAIT_MS + 5_000),
  endpoint: z.string().min(1).max(2048),
  /** Where tapping the notification lands — the session it came from. */
  url: z
    .string()
    .max(300)
    .regex(/^\/(?!\/)/)
    .optional(),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Schedules (or reschedules) the rest-timer alert for the caller's device.
 *
 * Every answer is 200 with a status the client can act on — "scheduled", or
 * "off" / "no-subscription" / "not-configured", which tell it to stop asking
 * for a while. None of those is an error worth showing mid-workout.
 */
export async function POST(request: NextRequest) {
  const config = pushConfig();
  if (!config) return NextResponse.json({ status: "not-configured" });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = scheduleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { delayMs, endpoint, url } = parsed.data;

  const [{ data: settings }, { data: subscription }] = await Promise.all([
    supabase.from("user_settings").select("rest_push").maybeSingle(),
    supabase.from("push_subscriptions").select("id").eq("endpoint", endpoint).maybeSingle(),
  ]);
  // No settings row yet means the defaults, and rest_push defaults to on.
  if (settings && !settings.rest_push) return NextResponse.json({ status: "off" });
  if (!subscription) return NextResponse.json({ status: "no-subscription" });

  const wait = Math.min(delayMs, MAX_WAIT_MS);
  const token = crypto.randomUUID();
  const { error } = await supabase.from("rest_alerts").upsert(
    {
      user_id: user.id,
      token,
      endpoint,
      url: url ?? "/",
      ends_at: new Date(Date.now() + wait).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: "Couldn't schedule the alert." }, { status: 500 });

  const userId = user.id;
  after(async () => {
    await sleep(wait);
    await deliverRestAlert(config, userId, token);
  });

  return NextResponse.json({ status: "scheduled" });
}

/** The rest was skipped or the session ended: whatever was pending stays silent. */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("rest_alerts").delete().eq("user_id", user.id);
  return NextResponse.json({ status: "cancelled" });
}
