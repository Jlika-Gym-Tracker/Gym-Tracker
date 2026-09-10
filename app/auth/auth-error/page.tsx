import type { Metadata } from "next";
import { AuthErrorPanel } from "@/components/auth/auth-error-panel";

export const metadata: Metadata = { title: "Sign-in link problem · JLIKA Gym" };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    description?: string;
    type?: string;
    reason?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <AuthErrorPanel
      // `reason` is the old single-param shape; still honoured so a stale link
      // in someone's inbox does not land on a blank explanation.
      code={params.code ?? params.reason ?? "unknown"}
      description={params.description}
      type={params.type}
    />
  );
}
