import { Bone, CardSkeleton, ScreenSkeleton } from "@/components/kit/skeleton";

// Deliberately generic: anyone may land here before the page decides they get
// a 404, so the skeleton names nothing.
export default function Loading() {
  return (
    <ScreenSkeleton label="this page">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-[18px]">
        <Bone className="h-[150px] rounded-[20px]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} className="h-[104px] rounded-[20px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <CardSkeleton lines={8} />
          <div className="flex flex-col gap-[18px]">
            <CardSkeleton lines={3} />
            <CardSkeleton lines={5} />
          </div>
        </div>
      </div>
    </ScreenSkeleton>
  );
}
