import { BarbellLoader } from "@/components/kit/barbell-loader";
import { LogoMark } from "@/components/shell/logo";

/**
 * The boot splash.
 *
 * The signed-in layout awaits the user and their profile before it renders,
 * and with no boundary above it nothing at all reached the browser until both
 * queries returned. Opened from the home screen there is no address bar to
 * show that anything is happening, so a cold launch was just a dark screen.
 * As the root boundary, this streams in the first bytes of the response and
 * animates without JavaScript; the shell replaces it when the layout is ready.
 *
 * Client navigations between signed-in screens never reach it: the shell
 * stays mounted and the per-route skeletons cover those.
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
