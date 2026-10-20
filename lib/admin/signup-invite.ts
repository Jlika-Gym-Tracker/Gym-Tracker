import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { inviteLookupClient } from "./access";
import { inviteStatus } from "./invite-code";

/**
 * The signup side of invite-only, for the signUp action.
 *
 * These checks are for a friendly message only. The rule itself is the
 * enforce_signup_invite trigger on auth.users, which a client calling
 * Supabase's signUp directly cannot skip.
 */

/**
 * Whether signup needs a code right now. Reads as "no" if the migration has
 * not been applied — in which case there is no trigger either, so that is the
 * truth.
 */
export async function signupInviteRequired(supabase: SupabaseClient<Database>): Promise<boolean> {
  const { data, error } = await supabase.rpc("signup_invite_required");
  return !error && data === true;
}

/**
 * "usable", "rejected", or "unchecked" when the server has no secret key to
 * look with (the trigger still decides).
 */
export async function checkSignupInvite(code: string): Promise<"usable" | "rejected" | "unchecked"> {
  const db = inviteLookupClient();
  if (!db) return "unchecked";
  const { data, error } = await db
    .from("signup_invites")
    .select("uses, max_uses, expires_at, revoked_at")
    .eq("code", code)
    .maybeSingle();
  if (error) return "unchecked";
  if (!data) return "rejected";
  return inviteStatus(data) === "active" ? "usable" : "rejected";
}
