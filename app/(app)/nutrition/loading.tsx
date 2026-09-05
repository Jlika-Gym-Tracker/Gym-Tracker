import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="nutrition">
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Bone className="h-[220px] rounded-[18px]" />
          <Bone className="h-[300px] rounded-[18px]" />
          <Bone className="h-[180px] rounded-[18px]" />
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={8} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </ScreenSkeleton>
  );
}
