import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="body progress">
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_348px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Bone className="h-[560px] rounded-[18px]" />
          <CardSkeleton lines={4} />
          {/* Training heatmap, then the lift-progress curve. */}
          <Bone className="h-[200px] rounded-[18px]" />
          <CardSkeleton lines={5} />
        </div>
        <div className="flex flex-col gap-[18px]">
          <CardSkeleton lines={7} />
          <CardSkeleton lines={4} />
          {/* Muscle map, then effort. */}
          <Bone className="h-[380px] rounded-[18px]" />
          <CardSkeleton lines={5} />
        </div>
      </div>
    </ScreenSkeleton>
  );
}
