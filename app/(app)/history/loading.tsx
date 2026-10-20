import { Bone, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="history">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-[18px] lg:grid lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start">
        {/* Month header and calendar. */}
        <div className="rounded-[20px] border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Bone className="size-11 rounded-[11px]" />
            <div className="flex flex-1 flex-col items-center gap-2">
              <Bone className="h-2.5 w-16" />
              <Bone className="h-4 w-32" />
            </div>
            <Bone className="size-11 rounded-[11px]" />
          </div>
          <Bone className="mx-auto mt-3 mb-3.5 h-2.5 w-40" />
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: 35 }, (_, i) => (
              <Bone key={i} className="aspect-square min-h-10 rounded-[10px] sm:min-h-11" />
            ))}
          </div>
        </div>
        {/* The month's sessions. */}
        <div className="rounded-[20px] border border-line bg-surface px-5 py-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 border-b border-[#1a1e20] py-3 last:border-b-0">
              <Bone className="h-2.5 w-24" />
              <Bone className="h-3.5 w-2/3" />
              <Bone className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </ScreenSkeleton>
  );
}
