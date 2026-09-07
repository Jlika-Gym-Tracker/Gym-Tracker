import { cn } from "@/lib/utils";

/**
 * Category tiles for food with no usable photo.
 *
 * Deliberately not a generic grey box — the colour carries the category, so the
 * grocery list still reads at a glance when an image is missing.
 */
const CATEGORY_STYLE: Record<string, { label: string; className: string }> = {
  protein: { label: "PR", className: "border-line-hi bg-accent-soft text-accent" },
  carbs: { label: "CA", className: "border-line bg-surface-2 text-fg-muted" },
  produce: { label: "PD", className: "border-line-hi bg-[#0f1409] text-accent-2" },
  dairy: { label: "DA", className: "border-line bg-surface-2 text-fg-muted" },
  fats: { label: "FA", className: "border-warn/30 bg-warn-soft text-warn" },
  pantry: { label: "PA", className: "border-line bg-surface-2 text-fg-dim" },
  other: { label: "··", className: "border-line bg-surface-2 text-fg-dim" },
};

export function FoodThumb({
  src,
  category,
  alt = "",
  size = 40,
  className,
}: {
  src: string | null | undefined;
  category: string;
  alt?: string;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      // Ingredient photos come from TheMealDB at a fixed host; next/image would
      // need a remotePatterns entry and buys nothing at this size.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        className={cn(
          "flex-none rounded-xl border border-line bg-surface-2 object-contain p-1",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  const style = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.other!;
  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-xl border font-mono font-bold",
        style.className,
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.28) }}
    >
      {style.label}
    </div>
  );
}

/**
 * A meal's picture is its main ingredient's.
 *
 * There is no photo of "chicken, rice and broccoli" in any free set, and
 * borrowing a stock photo of some other dish would be a small lie on every row.
 * The heaviest protein — or failing that the heaviest ingredient — is at least
 * true about what is on the plate.
 */
export function mealImage(recipe: {
  image_url?: string | null;
  ingredients: { grams: number; ingredient: { image_url?: string | null; category: string } }[];
}): { src: string | null; category: string } {
  if (recipe.image_url) return { src: recipe.image_url, category: "other" };

  const ranked = [...recipe.ingredients].sort((a, b) => {
    const proteinFirst =
      Number(b.ingredient.category === "protein") - Number(a.ingredient.category === "protein");
    return proteinFirst || b.grams - a.grams;
  });

  const withPhoto = ranked.find((row) => row.ingredient.image_url);
  const fallback = ranked[0];
  return {
    src: withPhoto?.ingredient.image_url ?? null,
    category: (withPhoto ?? fallback)?.ingredient.category ?? "other",
  };
}
