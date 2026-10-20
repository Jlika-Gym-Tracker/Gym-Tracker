import { Bone, ScreenSkeleton } from "@/components/kit/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton label="the exercise library">
      <div className="flex flex-col gap-[18px]">
        {/* Header, search and the three chip rows. */}
        <div className="rounded-[18px] border border-line bg-surface p-5">
          <Bone className="h-3.5 w-36" />
          <Bone className="mt-2 h-2.5 w-52" />
          <Bone className="mt-4 h-11 w-full rounded-[10px]" />
          {[7, 4, 6].map((chips, row) => (
            <div key={row} className="mt-3">
              <Bone className="h-2.5 w-16" />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Array.from({ length: chips }, (_, i) => (
                  <Bone key={i} className="h-[30px] w-16 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Bone key={i} className="h-[62px] rounded-[11px]" />
          ))}
        </div>
      </div>
    </ScreenSkeleton>
  );
}
