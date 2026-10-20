import { z } from "zod";

/**
 * Signup invite codes: what they look like, how they are made, and when one
 * can still be used. Pure, so the format the database checks
 * (20261020000034_admin.sql) and the one the app writes are tested together.
 *
 * These are not crew or coach codes. Those link two existing accounts; this
 * one lets an account exist at all while signup is invite-only.
 */

/** No I, O, 0 or 1 — codes get read aloud and typed in a noisy gym. */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_PREFIX = "JLIKA";
const GROUPS = 3;
const GROUP_LENGTH = 4;
const BODY_LENGTH = GROUPS * GROUP_LENGTH;

/** Must match the check constraint on public.signup_invites.code. */
export const INVITE_CODE_PATTERN =
  /^JLIKA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/** What the field's placeholder shows. */
export const INVITE_CODE_EXAMPLE = "JLIKA-7K2P-QX4M-H9RT";

function format(body: string) {
  const groups = Array.from({ length: GROUPS }, (_, i) =>
    body.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH),
  );
  return [INVITE_CODE_PREFIX, ...groups].join("-");
}

/**
 * Twelve characters from a 32-letter alphabet: 60 bits.
 *
 * The signup action says whether a code works, and nothing rate-limits a
 * server action, so the code itself has to be the thing not worth guessing.
 * 256 is a multiple of 32, so `byte % 32` is unbiased.
 */
export function generateInviteCode(
  randomBytes: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
): string {
  const bytes = randomBytes(BODY_LENGTH);
  const body = Array.from(bytes, (b) => INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length]).join("");
  return format(body);
}

/**
 * Turns whatever was typed into the stored form, or null if it cannot be a
 * code. Forgiving about case, spaces and dashes, and about leaving the JLIKA
 * prefix off; strict about the letters, so a mistyped O or 1 fails here with a
 * clear message instead of as "invalid code" later.
 */
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body =
    compact.length === INVITE_CODE_PREFIX.length + BODY_LENGTH && compact.startsWith(INVITE_CODE_PREFIX)
      ? compact.slice(INVITE_CODE_PREFIX.length)
      : compact;
  if (body.length !== BODY_LENGTH) return null;
  if ([...body].some((c) => !INVITE_CODE_ALPHABET.includes(c))) return null;
  return format(body);
}

export type InviteStatus = "active" | "expired" | "used_up" | "revoked";

type InviteState = {
  uses: number;
  max_uses: number;
  expires_at: string | null;
  revoked_at: string | null;
};

/** The same rule the signup trigger applies, in the same order of precedence. */
export function inviteStatus(invite: InviteState, now: Date = new Date()): InviteStatus {
  if (invite.revoked_at) return "revoked";
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  if (invite.uses >= invite.max_uses) return "used_up";
  return "active";
}

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  active: "Active",
  expired: "Expired",
  used_up: "Used up",
  revoked: "Revoked",
};

/** Shown to someone signing up. One message whatever the reason, so the form
 * does not tell a stranger which codes exist. */
export const INVITE_REJECTED =
  "That invite code can't be used. It may have expired, been used up or been revoked — ask for a new one.";

/** Days a new code lasts. 0 = never expires. */
export const INVITE_EXPIRY_DAYS = [1, 7, 30, 0] as const;
export const MAX_INVITE_USES = 100;

export const newInviteSchema = z.object({
  maxUses: z.coerce
    .number()
    .int("Uses must be a whole number.")
    .min(1, "A code needs at least one use.")
    .max(MAX_INVITE_USES, `At most ${MAX_INVITE_USES} uses per code.`),
  expiresInDays: z.coerce
    .number()
    .refine((d): d is (typeof INVITE_EXPIRY_DAYS)[number] =>
      (INVITE_EXPIRY_DAYS as readonly number[]).includes(d), "Pick how long the code lasts."),
  note: z
    .string()
    .trim()
    .max(60, "Keep the note under 60 characters.")
    .transform((v) => v || null),
});

export type NewInvite = z.infer<typeof newInviteSchema>;

/** When a code made now with this lifetime stops working, or null for never. */
export function inviteExpiry(expiresInDays: number, now: Date = new Date()): string | null {
  if (!expiresInDays) return null;
  return new Date(now.getTime() + expiresInDays * 86_400_000).toISOString();
}
