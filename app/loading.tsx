import { BarbellLoader } from "@/components/kit/barbell-loader";
import { LogoMark } from "@/components/shell/logo";

/**
 * Boot splash. As the root loading boundary it streams before the signed-in
 * layout's queries return, and animates without JavaScript.
 *
 * Next mounts this boundary afresh whenever a navigation crosses into another
 * top-level route group or folder, so a client navigation reaches it too
 * unless the destination has a loading.tsx of its own. Only entering the
 * signed-in shell should: every other top-level route needs its own, or
 * moving to it mid-app (signing out, say) shows this full-screen splash.
 */
export default function Loading() {
  return (
    <div
      data-boot-splash
      role="status"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg px-4 pb-[env(safe-area-inset-bottom)]"
    >
      <span className="sr-only">Loading JLIKA Gym…</span>
      <BarbellLoader width={232} className="max-w-[72vw]" />
      <div className="mt-9 flex items-center gap-2.5" aria-hidden>
        <LogoMark size={22} />
        <span className="text-[15px] font-extrabold tracking-[-0.02em]">JLIKA GYM</span>
      </div>
      <p className="mt-2 text-[13px] text-fg-soft" aria-hidden>
        Loading the bar
      </p>
    </div>
  );
}
