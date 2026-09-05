import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="the crew league">
      <div className="flex flex-col gap-[18px]">
        <Bone className="h-[240px] rounded-[20px]" />
        <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_372px]">
          <div className="flex min-w-0 flex-col gap-[18px]">
            <CardSkeleton lines={5} />
            <CardSkeleton lines={4} />
          </div>
          <div className="flex flex-col gap-[18px]">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={3} />
          </div>
        </div>
      </div>
    </ScreenSkeleton>
  );
}
