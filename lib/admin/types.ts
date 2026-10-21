import type { InviteStatus } from "./invite-code";

/**
 * What the operator dashboard can hold. Every field here is inside the privacy
 * boundary: account-level facts and counts. There is deliberately no type for
 * a session, a set, a weigh-in or a meal — nothing in lib/admin could carry
 * one to the browser even by mistake.
 */

export type AdminTotals = {
  accounts: number;
  active7d: number;
  active30d: number;
  sessionsThisWeek: number;
  disabled: number;
  /** yyyy-MM-dd the week's count starts from (the operator's own week start). */
  weekStart: string;
};

export type AdminAccount = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  disabled: boolean;
  finishedSessions: number;
  lastTrainedAt: string | null;
  /** Start of the open session, if one is open — however long ago. */
  openSessionSince: string | null;
  /** On ADMIN_EMAILS: cannot be disabled from here. */
  isAdmin: boolean;
  /** The operator looking at the page. */
  isSelf: boolean;
};

export type AccountsPage = {
  rows: AdminAccount[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  asOf: string;
};

/** An open session started in the last four hours: who, and since when. */
export type TrainingNowRow = { email: string; startedAt: string };

export type TrainingNow = { rows: TrainingNowRow[]; asOf: string };

export type SignupInviteView = {
  code: string;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
  status: InviteStatus;
};

export type InviteSettings = {
  inviteOnly: boolean;
  invites: SignupInviteView[];
};

/** Every admin action answers with one of these. */
export type AdminResult<T> = { ok: true; data: T; notice?: string } | { ok: false; error: string };
