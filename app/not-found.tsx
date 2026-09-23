import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { NavSpinner } from "@/components/shell/nav-spinner";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-bg p-[30px]">
      <div className="w-full max-w-[420px] rounded-[20px] border border-line bg-surface p-9 text-center">
        <Logo size={30} className="mb-7 justify-center" />
        <div className="eyebrow">404</div>
        <h1 className="display mt-3 text-[28px]">Nothing here.</h1>
        <p className="mt-2.5 text-[13.5px] leading-[1.5] text-fg-soft">
          That page doesn&apos;t exist — or it belongs to a phase that
          hasn&apos;t been built yet.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 mt-7 block rounded-[11px] bg-accent px-4 py-[15px] text-sm font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi"
        >
          <NavSpinner />
          Back to Today
        </Link>
      </div>
    </main>
  );
}
