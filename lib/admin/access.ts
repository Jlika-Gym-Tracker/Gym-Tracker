import "server-only";
import { createClient as createSecretClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "./emails";

/**
 * The door to the operator dashboard.
 *
 * An operator is a signed-in account whose verified email is on ADMIN_EMAILS.
 * The check runs on the server for every admin request — the page, and each
 * action again, because a server action is a public POST endpoint whoever
 * renders the button. Anyone else, or everyone when ADMIN_EMAILS is unset,
 * gets a 404 and nothing about the dashboard.
 */

/**
 * True when this address is on ADMIN_EMAILS. For deciding whether to show an
 * Admin link, e.g. `isAdmin(user.email)` in the app layout. The route does not
 * trust it alone: getAdmin() also requires the email to be verified.
 */
export function isAdmin(email: string | null | undefined): boolean {
  return isAdminEmail(email, process.env.ADMIN_EMAILS);
}

export type AdminContext = {
  userId: string;
  email: string;
  /**
   * Reads and writes past RLS with SUPABASE_SECRET_KEY. Null when the key is
   * not set, in which case the dashboard says so instead of failing. Only ever
   * used through lib/admin/queries.ts and app/actions/admin.ts, which stay
   * inside the privacy boundary.
   */
  db: SupabaseClient<Database> | null;
};

/** The signed-in operator, or null for anyone who is not one. */
export async function getAdmin(): Promise<AdminContext | null> {
  const supabase = await createClient();
  // getUser(), not getSession(): it asks the Auth server, so the email is the
  // account's real one rather than whatever a cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) return null;
  if (!isAdmin(user.email)) return null;

  return { userId: user.id, email: user.email, db: secretClient() };
}

function secretClient(): SupabaseClient<Database> | null {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSecretClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** For signup, which has no operator but needs to look a code up. */
export function inviteLookupClient(): SupabaseClient<Database> | null {
  return secretClient();
}

export const SECRET_KEY_MISSING =
  "SUPABASE_SECRET_KEY is not set on the server, so the dashboard cannot read accounts.";
