import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-bg p-[30px]">
      <div className="w-full max-w-[420px] rounded-[20px] border border-line bg-surface p-9">
        <Logo size={30} className="mb-7" />
        <h1 className="display text-[28px]">That link didn&apos;t work.</h1>
        <p className="mt-2.5 text-[13.5px] leading-[1.5] text-fg-soft">
          {reason === "missing_code" || reason === "missing_token"
            ? "The link was incomplete. Sign-in links can only be opened once and expire after an hour."
            : (reason ?? "Something went wrong while signing you in.")}
        </p>
        <Link
          href="/login"
          className="mt-7 block rounded-[11px] bg-accent px-4 py-[15px] text-center text-sm font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
