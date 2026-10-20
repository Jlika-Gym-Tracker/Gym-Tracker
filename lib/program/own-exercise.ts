/**
 * Slugs for exercises people add themselves.
 *
 * `exercises.slug` is unique across every row, global and personal alike, so
 * two people both adding "Sissy Squat" must not collide — and nobody's own
 * movement may take the slug a future seed row will want. Personal slugs are
 * namespaced by the owner and suffixed when the same person repeats a name.
 */

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "exercise"
  );
}

export function ownExerciseSlug(userId: string, name: string, attempt = 0): string {
  const base = `u-${userId.replace(/-/g, "").slice(0, 8)}-${slugify(name)}`;
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}
