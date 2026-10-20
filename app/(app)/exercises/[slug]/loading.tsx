import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="the exercise">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-[18px]">
        <Bone className="h-3 w-28" />
        {/* Photo beside name, muscles and the small body map. */}
        <div className="grid overflow-hidden rounded-[18px] border border-line bg-surface md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Bone className="aspect-[16/10] rounded-none md:aspect-auto md:min-h-[260px]" />
          <div className="flex gap-4 p-5">
            <div className="flex-1">
              <Bone className="h-4 w-32" />
              <Bone className="mt-4 h-6 w-3/4" />
              <Bone className="mt-4 h-3 w-1/2" />
              <Bone className="mt-2 h-3 w-2/3" />
            </div>
            <Bone className="h-[110px] w-[96px] sm:w-[132px]" />
          </div>
        </div>
        {/* Your numbers, then add-to-a-day beside the calculator. */}
        <CardSkeleton lines={4} />
        <div className="grid items-start gap-[18px] md:grid-cols-2">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={3} />
        </div>
        <CardSkeleton lines={6} />
      </div>
    </ScreenSkeleton>
  );
}
