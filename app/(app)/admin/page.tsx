import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/admin/access";
import { getAccounts, getInviteSettings, getTotals, getTrainingNow } from "@/lib/admin/queries";
import { currentWeekStart } from "@/lib/dates";
import { getWeekStartsOn } from "@/lib/settings/week";
import { AdminScreen, AdminUnavailable } from "@/components/admin/admin-screen";

/**
 * The operator dashboard.
 *
 * PRIVACY BOUNDARY: account-level facts and counts only — email, signup and
 * last sign-in, disabled or not, how many sessions and when the last one was,
 * and whether one is open right now. Never weights, sets, exercises,
 * weigh-ins, photos, nutrition or notes; lib/admin/queries.ts cannot fetch
 * them, and the SQL functions behind it cannot return them.
 *
 * Not an operator, or ADMIN_EMAILS unset: this route does not exist.
 */
export default async function AdminPage() {
  const admin = await getAdmin();
  if (!admin) notFound();
  if (!admin.db) return <AdminUnavailable />;

  const weekStart = currentWeekStart(new Date(), await getWeekStartsOn());
  const [totals, accounts, trainingNow, invites] = await Promise.all([
    getTotals(admin.db, weekStart),
    getAccounts(admin.db, admin.userId, { query: "", page: 1 }),
    getTrainingNow(admin.db),
    getInviteSettings(admin.db),
  ]);

  return (
    <AdminScreen totals={totals} accounts={accounts} trainingNow={trainingNow} invites={invites} />
  );
}
