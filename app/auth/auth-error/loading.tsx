import { Bone, ScreenSkeleton } from "@/components/kit/skeleton";

/**
 * Matches AuthErrorPanel's single card. Like the sign-in screens, this sits
 * outside the signed-in shell, so without its own boundary it would show the
 * root boot splash.
 */
export default function Loading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-bg p-[30px]">
      <div className="w-full max-w-[440px] rounded-[20px] border border-line bg-surface p-9">
        <ScreenSkeleton label="this screen">
          <Bone className="h-[30px] w-[130px]" />
          <Bone className="mt-7 h-6 w-[120px] rounded-md" />
          <Bone className="mt-4 h-8 w-3/4" />
          <Bone className="mt-2.5 h-3.5 w-full" />
          <Bone className="mt-2 h-3.5 w-2/3" />
          <Bone className="mt-6 h-2.5 w-16" />
          <Bone className="mt-2 h-[50px] rounded-[11px]" />
          <Bone className="mt-2.5 h-[50px] rounded-[11px]" />
          <Bone className="mx-auto mt-6 h-3 w-28" />
        </ScreenSkeleton>
      </div>
    </main>
  );
}
