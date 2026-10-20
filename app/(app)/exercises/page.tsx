import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Muscle, Tracking } from "@/lib/database.types";
import { getLibrary } from "@/lib/program/queries";
import { BROWSE_PAGE, browseHref, browseLibrary, parseBrowseParams } from "@/lib/exercises/browse";
import type { LibraryExercise } from "@/lib/program/match";
import { MUSCLE_GROUPS, MUSCLE_LABEL, equipmentLabel } from "@/lib/exercises/taxonomy";
import { Card } from "@/components/kit/card";
import { ExerciseThumb } from "@/components/program/exercise-thumb";
import { SearchBox } from "@/components/exercises/search-box";
import { AddOwnExercise } from "@/components/exercises/add-own-exercise";
import { cn } from "@/lib/utils";

const LOGGED_AS: { key: Tracking | null; label: string }[] = [
  { key: null, label: "ANY" },
  { key: "reps", label: "WEIGHT × REPS" },
  { key: "time", label: "TIMED" },
  { key: "cardio", label: "CARDIO" },
];

/**
 * The whole library: featured movements and your own first, then the rest of
 * free-exercise-db. Filtered on the server from the URL, a page of rows at a
 * time, so ~760 movements never travel to the browser at once.
 */
export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseBrowseParams(await searchParams);
  const library = await getLibrary();
  const { rows, total, equipmentOptions, activeEquipment, tailStart } = browseLibrary(library, params);
  const featured = library.filter((e) => e.featured).length;
  const yours = library.filter((e) => e.owner_id).length;
  const filtered = Boolean(params.q || params.group || activeEquipment.length || params.tracking);

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="rounded-[18px]">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold">Exercise library</h2>
            <p className="mt-1 font-mono text-[10.5px] text-fg-dim uppercase">
              {library.length} movements · {featured} featured
              {yours ? ` · ${yours} yours` : ""}
            </p>
          </div>
          <AddOwnExercise initialName={params.q} />
        </div>

        <div className="mt-3.5">
          <SearchBox params={params} total={library.length} />
        </div>

        <ChipRow label="Muscles">
          <Chip href={browseHref(params, { group: null })} on={!params.group}>
            ALL
          </Chip>
          {MUSCLE_GROUPS.map((g) => (
            <Chip key={g.key} href={browseHref(params, { group: g.key })} on={params.group === g.key}>
              {g.label}
            </Chip>
          ))}
        </ChipRow>

        <ChipRow label="Logged as">
          {LOGGED_AS.map((t) => (
            <Chip key={t.label} href={browseHref(params, { tracking: t.key })} on={params.tracking === t.key}>
              {t.label}
            </Chip>
          ))}
        </ChipRow>

        {equipmentOptions.length > 1 ? (
          <ChipRow
            label="Equipment"
            clear={activeEquipment.length ? browseHref(params, { equipment: [] }) : null}
          >
            {equipmentOptions.map((key) => {
              const on = activeEquipment.includes(key);
              return (
                <Chip
                  key={key}
                  round
                  on={on}
                  href={browseHref(params, {
                    equipment: on ? activeEquipment.filter((e) => e !== key) : [...activeEquipment, key],
                  })}
                >
                  {equipmentLabel(key)}
                </Chip>
              );
            })}
          </ChipRow>
        ) : null}
      </Card>

      <section aria-label="Exercises">
        <div className="mb-2.5 flex items-baseline gap-2 px-1">
          <span className="eyebrow">
            {params.q
              ? `${total} ${total === 1 ? "match" : "matches"}`
              : filtered
                ? `${total} ${total === 1 ? "movement" : "movements"}`
                : "Featured & yours first"}
          </span>
          {filtered ? (
            <Link href="/exercises" className="hit ml-auto font-mono text-[10px] text-fg-dim hover:text-accent">
              CLEAR ALL
            </Link>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <Card className="rounded-[18px] py-8 text-center text-[13px] text-fg-dim">
            <p>{params.q ? `Nothing matches “${params.q}”.` : "Nothing matches those filters."}</p>
            <div className="mt-2">
              <AddOwnExercise initialName={params.q} variant="link" />
            </div>
          </Card>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {rows.flatMap((exercise, i) => [
              ...(i === tailStart
                ? [
                    <li key="tail" role="presentation" className="col-span-full mt-3 mb-1 px-1">
                      <span className="eyebrow">The rest of the library</span>
                    </li>,
                  ]
                : []),
              <li key={exercise.id} className="min-w-0">
                <ExerciseRow exercise={exercise} />
              </li>,
            ])}
          </ul>
        )}

        {total > rows.length ? (
          <Link
            href={browseHref(params, { shown: params.shown + BROWSE_PAGE })}
            scroll={false}
            className="mt-3 flex min-h-11 items-center justify-center rounded-[11px] border border-line font-mono text-[10.5px] font-semibold text-fg-soft transition-colors hover:border-stroke hover:text-fg"
          >
            SHOW {Math.min(BROWSE_PAGE, total - rows.length)} MORE · {total - rows.length} LEFT
          </Link>
        ) : null}
      </section>
    </div>
  );
}

function ExerciseRow({ exercise }: { exercise: LibraryExercise }) {
  return (
    <Link
      href={`/exercises/${exercise.slug}`}
      className="flex min-w-0 items-center gap-[11px] rounded-[11px] border border-[#171b1d] bg-surface p-2 transition-colors hover:border-line-hi hover:bg-[#15191b]"
    >
      <ExerciseThumb
        src={exercise.image_start_url}
        muscle={exercise.primary_muscle}
        size={44}
        className="rounded-[9px]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-[1.3] font-semibold">{exercise.name}</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-dim uppercase">
          {MUSCLE_LABEL[exercise.primary_muscle as Muscle] ?? exercise.primary_muscle} ·{" "}
          {equipmentLabel(exercise.equipment)}
          {exercise.tracking === "time" ? " · timed" : ""}
          {exercise.tracking === "cardio" ? " · cardio" : ""}
        </span>
      </span>
      {exercise.owner_id ? (
        <span className="flex-none rounded-md border border-line-hi bg-accent-soft px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-accent">
          YOURS
        </span>
      ) : null}
      <ChevronRight className="size-4 flex-none text-[#3a4247]" strokeWidth={2} aria-hidden />
    </Link>
  );
}

function ChipRow({
  label,
  clear,
  children,
}: {
  label: string;
  clear?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline">
        <span className="eyebrow">{label}</span>
        {clear ? (
          <Link href={clear} scroll={false} className="hit ml-auto font-mono text-[10px] text-fg-dim hover:text-accent">
            CLEAR
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5 pointer-coarse:gap-y-3">{children}</div>
    </div>
  );
}

function Chip({
  href,
  on,
  round = false,
  children,
}: {
  href: string;
  on: boolean;
  round?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={cn(
        "hit border font-semibold transition-colors",
        round ? "rounded-full px-2.5 py-1 text-[11px]" : "rounded-lg px-[11px] py-[7px] font-mono text-[11px]",
        on
          ? "border-line-sel bg-accent-soft text-accent"
          : round
            ? "border-line text-fg-dim hover:border-stroke"
            : "border-line bg-surface-2 text-fg-soft hover:border-stroke",
      )}
    >
      {children}
    </Link>
  );
}
