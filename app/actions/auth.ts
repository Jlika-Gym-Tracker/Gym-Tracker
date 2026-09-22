"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { applyPendingSignup } from "@/lib/auth/pending-signup";

export type AuthState = { error?: string; notice?: string };

const emailSchema = z.email("Enter a valid email address.");

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

const signUpSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Your name needs at least 2 characters.")
      .max(60, "That name is too long."),
    email: emailSchema,
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Passwords are capped at 72 characters."),
    confirm: z.string(),
    inviteCode: z
      .union([z.literal(""), z.string().trim().min(4).max(24)])
      .transform((v) => (v ? v.toUpperCase() : null)),
    // "coach" comes from /signup?as=coach — the same account type, entered
    // through a different door.
    asCoach: z.boolean(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The two passwords do not match.",
  });

const magicLinkSchema = z.object({ email: emailSchema });

/** Only allow same-origin, absolute-path redirects — never an open redirect. */
function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function siteUrl() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error:
        error.code === "invalid_credentials"
          ? "That email and password do not match."
          : error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    inviteCode: (formData.get("inviteCode") as string)?.trim() ?? "",
    asCoach: formData.get("as") === "coach",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // display_name is read by the handle_new_user trigger. The invite code
      // rides along and is redeemed by the auth route handlers once there is a
      // session — it cannot be redeemed here, because email confirmation means
      // signUp often returns no session at all.
      data: {
        display_name: parsed.data.displayName,
        ...(parsed.data.inviteCode ? { invite_code: parsed.data.inviteCode } : {}),
        ...(parsed.data.asCoach ? { wants_coaching: true } : {}),
      },
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    return {
      error:
        error.code === "user_already_exists"
          ? "There is already an account with that email."
          : error.message,
    };
  }

  // With email confirmation on, Supabase returns a user but no session. The
  // metadata above is applied by the auth route handler instead.
  if (!data.session) {
    return {
      notice: `Check ${parsed.data.email} for a confirmation link to finish signing up.`,
    };
  }

  // Confirmation is off, so there is a session right here and no route handler
  // will run. Apply the same metadata now rather than leaving it stranded.
  await applyPendingSignup(supabase);

  revalidatePath("/", "layout");
  redirect("/");
}

export async function sendMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter your email first, then ask for a magic link." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/confirm` },
  });

  if (error) return { error: error.message };
  return { notice: `Magic link sent to ${parsed.data.email}.` };
}

/**
 * Sends a fresh confirmation or magic link.
 *
 * Deliberately reports success either way: telling an anonymous caller whether
 * an address has an account, or whether it is already confirmed, turns this
 * into an account-enumeration oracle.
 */
export async function resendLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  const kind = formData.get("kind") === "signup" ? "signup" : "magiclink";
  const supabase = await createClient();
  const redirect = `${await siteUrl()}/auth/confirm`;

  if (kind === "signup") {
    await supabase.auth.resend({
      type: "signup",
      email: parsed.data,
      options: { emailRedirectTo: redirect },
    });
  } else {
    await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { emailRedirectTo: redirect },
    });
  }

  return {
    notice: `If ${parsed.data} needs a link, one is on its way. It expires in an hour and works once.`,
  };
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in is unavailable.")}`);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
