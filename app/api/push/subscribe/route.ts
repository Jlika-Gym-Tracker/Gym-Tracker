import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { NOT_CONFIGURED, pushConfig } from "@/lib/push/server";

const bodySchema = z.object({
  subscription: z.object({
    endpoint: z.url({ protocol: /^https$/ }).max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(200),
      auth: z.string().min(1).max(100),
    }),
  }),
  timezone: z.string().min(1).max(64).optional(),
});

/** True for an IANA zone this runtime can format in, e.g. "Europe/Paris". */
function isTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves this browser's push subscription for the signed-in account, and the
 * browser's time zone with it: "18:00" and "today" in the workout-day reminder
 * mean the lifter's own, and this is the moment we learn what that is.
 */
export async function POST(request: NextRequest) {
  if (!pushConfig()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to turn on notifications." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "This browser sent a subscription we can't use." }, { status: 400 });
  }
  const { subscription, timezone } = parsed.data;

  const { error } = await supabase.rpc("save_push_subscription", {
    sub_endpoint: subscription.endpoint,
    sub_p256dh: subscription.keys.p256dh,
    sub_auth: subscription.keys.auth,
    sub_user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) return NextResponse.json({ error: "Couldn't save this device. Try again." }, { status: 500 });

  if (timezone && isTimeZone(timezone)) {
    await supabase.from("user_settings").upsert({ user_id: user.id, timezone }, { onConflict: "user_id" });
  }

  return NextResponse.json({ ok: true });
}
