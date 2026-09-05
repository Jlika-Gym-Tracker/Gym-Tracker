import { cn } from "@/lib/utils";

/** The lime tile with a rotated square — the app's only mark. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex flex-none items-center justify-center rounded-[9px] bg-accent"
      style={{ width: size, height: size }}
    >
      <div
        className="rotate-45 bg-bg"
        style={{ width: size * 0.36, height: size * 0.36 }}
      />
    </div>
  );
}

export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <div
        className="font-extrabold tracking-[-0.02em]"
        style={{ fontSize: size * 0.57 }}
      >
        JLIKA GYM
      </div>
    </div>
  );
}
