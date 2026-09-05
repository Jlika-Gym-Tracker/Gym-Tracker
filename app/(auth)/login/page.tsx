import type { Metadata } from "next";
import { AUTH_POINTS, AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { PLACEHOLDER_IMAGES } from "@/lib/placeholder-images";

export const metadata: Metadata = { title: "Sign in · JLIKA Gym" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <AuthShell
      image={PLACEHOLDER_IMAGES.authPanel}
      eyebrow="Built for you and your crew"
      points={AUTH_POINTS}
    >
      <LoginForm next={target} initialError={error} />
    </AuthShell>
  );
}
