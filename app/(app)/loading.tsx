import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

/**
 * The boundary for the whole signed-in group, which is what a hard load or a
 * refresh renders — the per-route skeletons below it cover navigations between
 * screens. So this one stays deliberately generic: it used to be shaped like
 * Today and announce "Loading today" on every URL, including /program.
 */
export default function Loading() {
  return (
    <ScreenSkeleton label="this screen">
      <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[1fr_336px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Bone className="h-[180px] rounded-[20px]" />
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Bone key={i} className="h-[92px] rounded-[20px]" />
            ))}
          </div>
          <CardSkeleton lines={4} />
        </div>
        <div className="flex flex-col gap-[18px]">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </ScreenSkeleton>
  );
}
