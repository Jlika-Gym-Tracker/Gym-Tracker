import { Bone, ScreenSkeleton } from "@/components/kit/skeleton";

/** Matches the invite screen's shell: card on the left, photo panel on the right. */
export default function Loading() {
  return (
    <main className="flex min-h-svh items-stretch gap-[18px] bg-bg p-4 lg:p-[30px]">
      <div className="flex flex-1 flex-col justify-center rounded-[20px] border border-line bg-surface px-6 py-[34px] sm:px-[38px]">
        <ScreenSkeleton label="your invite">
          <Bone className="h-[30px] w-[130px]" />
          <Bone className="mt-[30px] h-6 w-[120px] rounded-md" />
          <Bone className="mt-5 h-9 w-full max-w-[420px]" />
          <Bone className="mt-3 h-3.5 w-full max-w-[460px]" />
          <Bone className="mt-5 h-[76px] w-full max-w-[520px] rounded-[14px]" />
          <Bone className="mt-4 h-[120px] w-full max-w-[520px] rounded-[14px]" />
          <Bone className="mt-6 h-[46px] w-[170px] rounded-[11px]" />
        </ScreenSkeleton>
      </div>
      <div className="hidden w-[392px] flex-none rounded-[20px] border border-line bg-surface lg:block" />
    </main>
  );
}
