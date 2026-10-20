import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SignupInvite } from "@/lib/database.types";
import { isAdmin } from "./access";
import { inviteStatus } from "./invite-code";
import type {
  AccountsPage,
  AdminTotals,
  InviteSettings,
  SignupInviteView,
  TrainingNow,
} from "./types";

/**
 * Every read the operator dashboard makes.
 *
 * PRIVACY BOUNDARY: training data is read only through the admin_* functions
 * in 20261020000034_admin.sql, which return counts and timestamps and nothing
 * else. Nothing here, in app/actions/admin.ts or in components/admin may
 * select from a user's tables directly — no sessions, sets, exercises,
 * weigh-ins, photos, nutrition or notes. lib/admin/boundary.test.ts fails the
 * build if one does.
 */

type Db = SupabaseClient<Database>;

export const ACCOUNTS_PAGE_SIZE = 20;
const MAX_SEARCH = 100;

export async function getTotals(db: Db, weekStart: string): Promise<AdminTotals> {
  const { data, error } = await db.rpc("admin_overview", { p_week_start: weekStart });
  if (error) throw error;
  const row = data?.[0];
  return {
    accounts: Number(row?.accounts ?? 0),
    active7d: Number(row?.active_7d ?? 0),
    active30d: Number(row?.active_30d ?? 0),
    sessionsThisWeek: Number(row?.sessions_this_week ?? 0),
    disabled: Number(row?.disabled ?? 0),
    weekStart,
  };
}

export async function getAccounts(
  db: Db,
  operatorId: string,
  { query, page }: { query: string; page: number },
): Promise<AccountsPage> {
  const search = query.trim().slice(0, MAX_SEARCH);
  const current = Math.max(1, Math.floor(page));
  const { data, error } = await db.rpc("admin_accounts", {
    p_search: search || null,
    p_limit: ACCOUNTS_PAGE_SIZE,
    p_offset: (current - 1) * ACCOUNTS_PAGE_SIZE,
  });
  if (error) throw error;

  // Accounts deleted since the last page was loaded can leave this one empty;
  // land on the first page rather than an empty one with no way back.
  if (!data?.length && current > 1) return getAccounts(db, operatorId, { query: search, page: 1 });

  return {
    rows: (data ?? []).map((r) => ({
      id: r.user_id,
      email: r.email ?? "(no email)",
      createdAt: r.created_at,
      lastSignInAt: r.last_sign_in_at,
      disabled: r.disabled,
      finishedSessions: Number(r.finished_sessions),
      lastTrainedAt: r.last_trained_at,
      openSessionSince: r.open_session_since,
      isAdmin: isAdmin(r.email),
      isSelf: r.user_id === operatorId,
    })),
    total: Number(data?.[0]?.total ?? 0),
    page: current,
    pageSize: ACCOUNTS_PAGE_SIZE,
    query: search,
    asOf: new Date().toISOString(),
  };
}

export async function getTrainingNow(db: Db): Promise<TrainingNow> {
  const { data, error } = await db.rpc("admin_training_now");
  if (error) throw error;
  return {
    rows: (data ?? []).map((r) => ({ email: r.email ?? "(no email)", startedAt: r.started_at })),
    asOf: new Date().toISOString(),
  };
}

/** How many codes the dashboard lists: every live one, then the latest dead ones. */
const INVITE_LIST_LIMIT = 50;

export function toInviteView(invite: SignupInvite, now = new Date()): SignupInviteView {
  return {
    code: invite.code,
    maxUses: invite.max_uses,
    uses: invite.uses,
    expiresAt: invite.expires_at,
    note: invite.note,
    createdAt: invite.created_at,
    status: inviteStatus(invite, now),
  };
}

export async function getInviteSettings(db: Db): Promise<InviteSettings> {
  const [settings, invites] = await Promise.all([
    db.from("app_settings").select("invite_only").eq("id", 1).maybeSingle(),
    db
      .from("signup_invites")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(INVITE_LIST_LIMIT),
  ]);
  if (settings.error) throw settings.error;
  if (invites.error) throw invites.error;

  const now = new Date();
  const views = (invites.data ?? []).map((i) => toInviteView(i, now));
  // Codes that still work first; the rest are history.
  views.sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
  return { inviteOnly: settings.data?.invite_only ?? false, invites: views };
}
