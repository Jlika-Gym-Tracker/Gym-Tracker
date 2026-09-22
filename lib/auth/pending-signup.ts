import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Applies everything the signup form carried, once there is a session to do it
 * with.
 *
 * Signing up with email confirmation on returns a user but no session, so none
 * of this can happen at the moment of signUp. It rides along in user metadata
 * and is applied on the first request that does have a session — either the
 * auth route handlers, or signUp itself when confirmation is off and a session
 * comes back immediately. Metadata is cleared either way so it runs once.
 */
export async function applyPendingSignup(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const code = user.user_metadata?.invite_code;
  const wantsCoaching = user.user_metadata?.wants_coaching === true;
  if (!wantsCoaching && (typeof code !== "string" || !code)) return;

  if (wantsCoaching) {
    // Set before the first render so the Coach nav exists immediately —
    // otherwise a new coach lands on a shell with nowhere to coach from.
    await supabase
      .from("profiles")
      .update({ coaching_enabled: true })
      .eq("id", user.id);
  }

  if (typeof code === "string" && code) {
    try {
      // Both kinds of code arrive through the same field. The prefix decides
      // which one it is; a coach code redeemed as a crew code would just fail.
      if (code.startsWith("COACH-")) {
        await supabase.rpc("redeem_coach_invite", { invite_code: code });
      } else {
        await supabase.rpc("redeem_crew_invite", { invite_code: code });
      }
    } catch {
      // An expired or used-up code must never block someone signing in; they
      // can join from Profile → Coach or Profile → Crew instead.
    }
  }

  await supabase.auth.updateUser({
    data: { invite_code: null, wants_coaching: null },
  });
}
