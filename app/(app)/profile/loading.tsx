import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="your profile">
      <div className="flex flex-col gap-[18px]">
        <Bone className="h-[116px] rounded-[20px]" />
        <Bone className="h-9 w-[420px] rounded-full" />
        <CardSkeleton lines={8} />
      </div>
    </ScreenSkeleton>
  );
}
