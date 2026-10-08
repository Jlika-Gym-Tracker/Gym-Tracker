import "server-only";
import { createClient } from "@/lib/supabase/server";
import { WEEK_STARTS_ON, type WeekStartDay } from "@/lib/dates";

/**
 * Which weekday this user's training week begins on.
 *
 * Falls back to Monday rather than throwing: a database that has not had
 * `20261008000025_week_starts_on.sql` applied yet would otherwise break every
 * screen that asks, and Monday is what those screens assumed before.
 */
export async function getWeekStartsOn(): Promise<WeekStartDay> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return WEEK_STARTS_ON;

  const { data, error } = await supabase
    .from("user_settings")
    .select("week_starts_on")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || data?.week_starts_on == null) return WEEK_STARTS_ON;
  return data.week_starts_on as WeekStartDay;
}
