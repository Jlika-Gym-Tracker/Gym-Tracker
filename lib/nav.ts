export type NavItem = {
  href: string;
  label: string;
  /** Small mono badge on the right of the row (e.g. "W12"). Data-driven later. */
  meta?: string;
};

export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Train",
    items: [
      { href: "/", label: "Today" },
      { href: "/session", label: "Live session" },
      { href: "/program", label: "Program" },
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
  "/profile": { title: "Profile & settings", sub: "Account · targets · food · crew" },
};

export function titleForPath(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const base = Object.keys(PAGE_TITLES)
    .filter((p) => p !== "/" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return base ? PAGE_TITLES[base] : { title: "JLIKA Gym", sub: "" };
}

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
