import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ endpoint: z.string().min(1).max(2048) });

/**
 * Forgets one of the caller's devices. Works whether or not push is configured
 * here, so a device can always be turned off.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to change notifications." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing the device to turn off." }, { status: 400 });

  // RLS limits the delete to the caller's own rows. A rest alert waiting on
  // this device goes too: there's nothing left to deliver it to.
  const [{ error }] = await Promise.all([
    supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint),
    supabase.from("rest_alerts").delete().eq("endpoint", parsed.data.endpoint),
  ]);
  if (error) return NextResponse.json({ error: "Couldn't update this device. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
