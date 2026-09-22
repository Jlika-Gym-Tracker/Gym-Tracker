import { Bone, ScreenSkeleton } from "@/components/kit/skeleton";

/** Onboarding owns the whole screen, so its skeleton does too. */
export default function Loading() {
  return (
    <main className="flex min-h-svh items-stretch gap-[18px] bg-bg p-4 lg:p-[30px]">
      <div className="flex flex-1 flex-col rounded-[20px] border border-line bg-surface px-6 py-[34px] sm:px-[38px]">
        <ScreenSkeleton label="your setup">
          <Bone className="h-[30px] w-[130px]" />
          <Bone className="mt-[26px] h-2.5 w-24" />
          <Bone className="mt-4 h-9 w-3/4 max-w-[420px]" />
          <div className="mt-7 flex flex-col gap-3">
            <Bone className="h-[52px] max-w-[420px] rounded-[11px]" />
            <Bone className="h-[52px] max-w-[420px] rounded-[11px]" />
          </div>
          <Bone className="mt-7 h-[46px] w-[190px] rounded-[11px]" />
        </ScreenSkeleton>
      </div>
      <div className="hidden w-[392px] flex-none rounded-[20px] border border-line bg-surface lg:block" />
    </main>
  );
}
