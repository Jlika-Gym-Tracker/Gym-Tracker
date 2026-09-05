import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Redeems the invite code carried in user metadata from signup.
 *
 * Signing up with email confirmation on returns no session, so the code cannot
 * be redeemed at that moment. The auth route handlers call this on the first
 * request that does have a session, then clear the code so it runs once.
 */
export async function redeemPendingInvite(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const code = user?.user_metadata?.invite_code;
  if (!user || typeof code !== "string" || !code) return;

  try {
    await supabase.rpc("redeem_crew_invite", { invite_code: code });
  } catch {
    // An expired or used-up code should never block someone signing in; they
    // can join from Profile → Crew instead.
  } finally {
    await supabase.auth.updateUser({ data: { invite_code: null } });
  }
}
