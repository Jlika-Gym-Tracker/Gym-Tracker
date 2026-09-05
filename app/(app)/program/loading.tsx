import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="the program builder">
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Bone className="h-[84px] rounded-[18px]" />
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Bone key={i} className="h-[320px] rounded-[18px]" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={5} />
        </div>
      </div>
    </ScreenSkeleton>
  );
}
