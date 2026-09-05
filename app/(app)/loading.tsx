import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="today">
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Bone className="h-[268px] rounded-[20px]" />
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <CardSkeleton key={i} lines={2} />
            ))}
          </div>
          <CardSkeleton lines={4} />
        </div>
        <div className="flex flex-col gap-[18px]">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </ScreenSkeleton>
  );
}
