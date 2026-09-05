import { Logo } from "@/components/shell/logo";

export type ValuePoint = { title: string; body: string };

export const AUTH_POINTS: ValuePoint[] = [
  {
    title: "One account per person",
    body: "You and your friends each get a private space — nobody sees another's photos or numbers.",
  },
  {
    title: "Your week, your rules",
    body: "Paste or build the program yourself. Nothing is auto-generated unless you ask.",
  },
  {
    title: "Everything in one timeline",
    body: "Sets, bodyweight, photos and meals line up on the same dates so progress is obvious.",
  },
];

/** The split auth layout: form card on the left, imagery and value cards on the right. */
export function AuthShell({
  children,
  image,
  eyebrow,
  points,
}: {
  children: React.ReactNode;
  image: string;
  eyebrow: string;
  points: ValuePoint[];
}) {
  return (
    <main className="flex min-h-svh items-stretch gap-[18px] bg-bg p-[30px]">
      <div className="flex flex-1 flex-col items-center justify-center rounded-[20px] border border-line bg-surface p-6 sm:p-[38px]">
        <div className="w-full max-w-[392px]">
          <Logo size={30} className="mb-[30px]" />
          {children}
        </div>
      </div>

      <div
        className="relative hidden w-[452px] flex-none overflow-hidden rounded-[20px] border border-line bg-surface bg-cover bg-center lg:block"
        style={{ backgroundImage: `url(${image})` }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#08090ab0_0%,#08090a70_45%,#08090af7_100%)]" />
        <div className="relative flex h-full flex-col p-8">
          <div className="font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
            {eyebrow}
          </div>
          <div className="mt-auto flex flex-col gap-3">
            {points.map((p) => (
              <div
                key={p.title}
                className="rounded-[14px] border border-line bg-[#0f1214d9] px-[17px] py-[15px] backdrop-blur-sm"
              >
                <div className="text-sm font-bold">{p.title}</div>
                <div className="mt-1.5 text-[12.5px] leading-[1.5] text-fg-muted">
                  {p.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
