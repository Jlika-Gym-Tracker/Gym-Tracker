import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="the AI Coach">
      <div className="mx-auto flex max-w-[880px] flex-col gap-[18px]">
        <Bone className="h-[124px] rounded-[20px]" />
        <Bone className="h-11 rounded-[12px]" />
        <CardSkeleton lines={6} />
        <CardSkeleton lines={4} />
      </div>
    </ScreenSkeleton>
  );
}
