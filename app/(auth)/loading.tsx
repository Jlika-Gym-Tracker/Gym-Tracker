import { Bone, ScreenSkeleton } from "@/components/kit/skeleton";

/**
 * Matches AuthShell: form card on the left, image panel on the right. Signing
 * out lands here from the signed-in app; without this boundary that would
 * show the root boot splash instead.
 */
export default function Loading() {
  return (
    <main className="flex min-h-svh items-stretch gap-[18px] bg-bg p-[30px]">
      <div className="flex flex-1 flex-col items-center justify-center rounded-[20px] border border-line bg-surface p-6 sm:p-[38px]">
        <div className="w-full max-w-[392px]">
          <ScreenSkeleton label="this screen">
            <Bone className="h-[30px] w-[130px]" />
            <Bone className="mt-[30px] h-9 w-3/4" />
            <Bone className="mt-3 h-3.5 w-full" />
            <Bone className="mt-2 h-3.5 w-2/3" />
            <div className="mt-[26px] flex flex-col gap-[11px]">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i}>
                  <Bone className="h-2.5 w-16" />
                  <Bone className="mt-2 h-[50px] rounded-[11px]" />
                </div>
              ))}
              <Bone className="mt-1 h-[50px] rounded-[11px]" />
            </div>
            <Bone className="mx-auto mt-6 h-3 w-40" />
          </ScreenSkeleton>
        </div>
      </div>
      <div className="hidden w-[452px] flex-none rounded-[20px] border border-line bg-surface lg:block" />
    </main>
  );
}
