import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="coaching">
      <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Bone className="h-[132px] rounded-[20px]" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Bone key={i} className="h-[92px] rounded-[18px]" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-[18px]">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </ScreenSkeleton>
  );
}
