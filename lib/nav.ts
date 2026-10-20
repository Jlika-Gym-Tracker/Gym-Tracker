export type NavItem = {
  href: string;
  label: string;
  /** Small mono badge on the right of the row (e.g. "W12"). Data-driven later. */
  meta?: string;
};

export type NavGroup = { title: string; items: NavItem[] };

/** Only shown to accounts with coaching turned on. */
export const COACH_GROUP: NavGroup = {
  title: "Coach",
  items: [{ href: "/coach", label: "My athletes" }],
};

/** Only shown when the server has an Anthropic key (lib/ai-coach/config.ts). */
export const AI_COACH_ITEM: NavItem = { href: "/ai-coach", label: "AI Coach" };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Train",
    items: [
      { href: "/", label: "Today" },
      { href: "/session", label: "Live session" },
      { href: "/program", label: "Program" },
      { href: "/history", label: "History" },
    ],
  },
  {
    title: "Body & fuel",
    items: [
      { href: "/progress", label: "Body progress" },
      { href: "/nutrition", label: "Nutrition" },
      { href: "/league", label: "Crew league" },
    ],
  },
];

/** Top-bar copy per route. Today's title is greeted client-side from the local hour. */
export const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Let's get after it", sub: "" },
  "/session": { title: "Live session", sub: "Set logging · autosaved" },
  "/program": {
    title: "Program builder",
    sub: "You write the week · we track the rest",
  },
  "/progress": {
    title: "Body progress",
    sub: "Photos · weight · measurements",
  },
  "/nutrition": { title: "Nutrition", sub: "Fat loss · meal plan · groceries" },
  "/league": { title: "Crew league", sub: "Consistency · transformation" },
  "/profile": { title: "Profile & settings", sub: "Account · training · targets · crew" },
  "/coach": { title: "Coaching", sub: "Athletes · programs · invites" },
  "/ai-coach": { title: "AI Coach", sub: "Optional · you approve every change" },
  "/history": { title: "History", sub: "Every session · month by month" },
};

/**
 * The sidebar's groups for this account and server: AI Coach joins Train when
 * the server has a key, Coach is added for accounts that coach.
 */
export function navGroups({ coaching = false, aiCoach = false } = {}): NavGroup[] {
  const groups = NAV_GROUPS.map((group) =>
    aiCoach && group.title === "Train" ? { ...group, items: [...group.items, AI_COACH_ITEM] } : group,
  );
  return coaching ? [...groups, COACH_GROUP] : groups;
}

/** A finished session's summary sits under /session but is not a live session. */
const SUMMARY_TITLE = { title: "Session summary", sub: "Time · volume · new bests" };

export function titleForPath(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (/^\/session\/[^/]+\/summary\/?$/.test(pathname)) return SUMMARY_TITLE;
  const base = Object.keys(PAGE_TITLES)
    .filter((p) => p !== "/" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return base ? PAGE_TITLES[base] : { title: "JLIKA Gym", sub: "" };
}

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
