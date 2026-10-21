import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { NOT_CONFIGURED, pushConfig, sendPush } from "@/lib/push/server";

const bodySchema = z.object({ endpoint: z.string().min(1).max(2048).optional() });

/**
 * "Send a test": pushes one notification to the device that asked (or every
 * device, without an endpoint), so the lifter can see it works before relying
 * on it mid-workout.
 */
export async function POST(request: NextRequest) {
  const config = pushConfig();
  if (!config) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to send a test." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "That request didn't make sense." }, { status: 400 });

  let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id);
  if (parsed.data.endpoint) query = query.eq("endpoint", parsed.data.endpoint);
  const { data: subscriptions, error } = await query;
  if (error) return NextResponse.json({ error: "Couldn't look up your devices. Try again." }, { status: 500 });
  if (!subscriptions?.length) {
    return NextResponse.json(
      { error: "This device isn't registered any more. Turn notifications off and on again." },
      { status: 404 },
    );
  }

  const { sent, gone } = await sendPush(
    config,
    subscriptions,
    { title: "JLIKA Gym", body: "Notifications work on this device.", url: "/profile", tag: "test", always: true },
    { ttl: 300, urgency: "normal" },
  );
  if (gone.length) await supabase.from("push_subscriptions").delete().in("id", gone);

  if (sent === 0) {
    return NextResponse.json(
      {
        error: gone.length
          ? "This device's subscription has expired. Turn notifications off and on again."
          : "The push service didn't accept it. Try again in a minute.",
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ sent });
}
