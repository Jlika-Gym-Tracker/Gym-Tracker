"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getAdmin, isAdmin, SECRET_KEY_MISSING } from "@/lib/admin/access";
import { getAccounts, getTrainingNow, toInviteView } from "@/lib/admin/queries";
import {
  generateInviteCode,
  inviteExpiry,
  newInviteSchema,
  normalizeInviteCode,
} from "@/lib/admin/invite-code";
import type {
  AccountsPage,
  AdminResult,
  SignupInviteView,
  TrainingNow,
} from "@/lib/admin/types";

/**
 * The operator dashboard's writes and refreshes.
 *
 * Each one checks again that the caller is an operator: a server action is a
 * public POST endpoint, whoever happens to render the button. A non-operator
 * gets "Not found." and nothing else.
 *
 * PRIVACY BOUNDARY: these touch accounts (ban / unban, end sessions), the
 * instance's settings and its signup codes. They never read or return anyone's
 * training, body, photo or nutrition data — see lib/admin/queries.ts.
 */

type Db = SupabaseClient<Database>;

/** GoTrue has no "forever"; a hundred years will do. Lifted with "none". */
const DISABLED_FOR = "876000h";

function message(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Something went wrong.";
}

async function asOperator<T>(
  run: (operator: { userId: string; db: Db }) => Promise<AdminResult<T>>,
): Promise<AdminResult<T>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Not found." };
  if (!admin.db) return { ok: false, error: SECRET_KEY_MISSING };
  try {
    return await run({ userId: admin.userId, db: admin.db });
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

function invalid(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? "Check the form and try again." };
}

const accountsSchema = z.object({
  query: z.string().max(100, "Search for at most 100 characters."),
  page: z.number().int().min(1).max(100_000),
});

/** A page of the accounts list, optionally narrowed by email. */
export async function loadAccounts(input: {
  query: string;
  page: number;
}): Promise<AdminResult<AccountsPage>> {
  return asOperator(async ({ userId, db }) => {
    const parsed = accountsSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    return { ok: true, data: await getAccounts(db, userId, parsed.data) };
  });
}

/** Who has a session open from the last four hours. Email and start time only. */
export async function refreshTrainingNow(): Promise<AdminResult<TrainingNow>> {
  return asOperator(async ({ db }) => ({ ok: true, data: await getTrainingNow(db) }));
}

const disableSchema = z.object({ userId: z.uuid(), disabled: z.boolean() });

/**
 * Disables or re-enables an account.
 *
 * Disabling bans it in Supabase Auth, so it cannot sign in or refresh a
 * session, then deletes its sessions so it is signed out now rather than when
 * its current token runs out. Enabling lifts the ban. Nothing it owns is
 * touched either way.
 */
export async function setAccountDisabled(input: {
  userId: string;
  disabled: boolean;
}): Promise<AdminResult<{ disabled: boolean }>> {
  return asOperator(async ({ userId: operatorId, db }) => {
    const parsed = disableSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { userId, disabled } = parsed.data;

    if (userId === operatorId) {
      return { ok: false, error: "You can't disable your own account." };
    }

    const { data: target, error: lookupError } = await db.auth.admin.getUserById(userId);
    if (lookupError || !target.user) return { ok: false, error: "That account no longer exists." };
    if (disabled && isAdmin(target.user.email)) {
      return {
        ok: false,
        error: "Admins can't be disabled here. Take the address off ADMIN_EMAILS first.",
      };
    }

    const { error } = await db.auth.admin.updateUserById(userId, {
      ban_duration: disabled ? DISABLED_FOR : "none",
    });
    if (error) throw error;

    let notice = disabled
      ? "Disabled and signed out everywhere."
      : "Enabled. They can sign in again.";
    if (disabled) {
      const { error: endError } = await db.rpc("admin_end_sessions", { p_user: userId });
      if (endError) {
        notice =
          "Disabled, but their open sessions could not be ended: a device already signed in stays in until its token expires (up to an hour).";
      }
    }

    revalidatePath("/admin");
    return { ok: true, data: { disabled }, notice };
  });
}

/**
 * Turns invite-only signup on or off. Takes effect at once: the signup trigger
 * reads the same row. Accounts that already exist are never affected.
 */
export async function setInviteOnly(on: boolean): Promise<AdminResult<{ inviteOnly: boolean }>> {
  return asOperator(async ({ userId, db }) => {
    const parsed = z.boolean().safeParse(on);
    if (!parsed.success) return invalid(parsed.error);

    const { data, error } = await db
      .from("app_settings")
      .update({ invite_only: parsed.data, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", 1)
      .select("invite_only")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return { ok: false, error: "app_settings has no row. Apply 20261020000034_admin.sql again." };
    }

    revalidatePath("/admin");
    return {
      ok: true,
      data: { inviteOnly: data.invite_only },
      notice: data.invite_only
        ? "Signup is invite-only. New accounts need a code, Google sign-ups included."
        : "Signup is open to anyone again.",
    };
  });
}

/** A fresh signup code. Codes are random, so a clash is retried, not reported. */
export async function createSignupInvite(
  formData: FormData,
): Promise<AdminResult<SignupInviteView>> {
  return asOperator(async ({ userId, db }) => {
    const parsed = newInviteSchema.safeParse({
      maxUses: formData.get("maxUses"),
      expiresInDays: formData.get("expiresInDays"),
      note: formData.get("note") ?? "",
    });
    if (!parsed.success) return invalid(parsed.error);

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await db
        .from("signup_invites")
        .insert({
          code: generateInviteCode(),
          max_uses: parsed.data.maxUses,
          expires_at: inviteExpiry(parsed.data.expiresInDays),
          note: parsed.data.note,
          created_by: userId,
        })
        .select("*")
        .single();
      if (!error) {
        revalidatePath("/admin");
        return { ok: true, data: toInviteView(data) };
      }
      if (error.code !== "23505") throw error;
    }
    return { ok: false, error: "Could not generate a unique code. Try again." };
  });
}

/** Stops a code working. Accounts already made with it are unaffected. */
export async function revokeSignupInvite(code: string): Promise<AdminResult<SignupInviteView>> {
  return asOperator(async ({ db }) => {
    const normalized = normalizeInviteCode(code);
    if (!normalized) return { ok: false, error: "That isn't a signup code." };

    const { data, error } = await db
      .from("signup_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("code", normalized)
      .is("revoked_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "That code is already revoked." };

    revalidatePath("/admin");
    return { ok: true, data: toInviteView(data) };
  });
}
