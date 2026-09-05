import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="your session">
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_372px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Bone className="h-[86px] rounded-[18px]" />
          {Array.from({ length: 3 }, (_, i) => (
            <Bone key={i} className="h-[260px] rounded-[18px]" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Bone className="h-[420px] rounded-[18px]" />
          <CardSkeleton lines={2} />
        </div>
      </div>
    </ScreenSkeleton>
  );
}
