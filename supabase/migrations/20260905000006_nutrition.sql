-- JLIKA Gym — Phase 5: ingredients, recipes, meal plans and the grocery list.
-- Allergies and excluded ingredients are hard filters: a recipe containing one
-- must never appear in a plan, a swap or a search result.

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users on delete cascade,  -- null = global seed
  slug text unique not null,
  name text not null,
  category text not null check (category in (
    'protein','carbs','produce','dairy','fats','pantry','other'
  )),
  kcal_per_100g numeric(6,1) not null check (kcal_per_100g >= 0),
  protein_g numeric(5,1) not null default 0,
  carb_g numeric(5,1) not null default 0,
  fat_g numeric(5,1) not null default 0,
  -- Matched against user_excludes of kind 'allergen'.
  allergens text[] not null default '{}',
  -- How the grocery list should read: '250 g' vs '3'.
  unit_hint text not null default 'g'
);

alter table public.ingredients enable row level security;

drop policy if exists "ingredients: read global or own" on public.ingredients;
create policy "ingredients: read global or own"
  on public.ingredients for select
  using (owner_id is null or owner_id = (select auth.uid()));

drop policy if exists "ingredients: write own" on public.ingredients;
create policy "ingredients: write own"
  on public.ingredients for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users on delete cascade,
  slug text unique not null,
  name text not null,
  slot_hint text check (slot_hint in ('breakfast','lunch','pre_workout','dinner','snack')),
  prep_minutes int check (prep_minutes >= 0),
  image_url text,
  steps text[] not null default '{}'
);

alter table public.recipes enable row level security;

drop policy if exists "recipes: read global or own" on public.recipes;
create policy "recipes: read global or own"
  on public.recipes for select
  using (owner_id is null or owner_id = (select auth.uid()));

drop policy if exists "recipes: write own" on public.recipes;
create policy "recipes: write own"
  on public.recipes for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table if not exists public.recipe_ingredients (
  recipe_id uuid not null references public.recipes on delete cascade,
  ingredient_id uuid not null references public.ingredients,
  grams numeric(7,1) not null check (grams > 0),
  primary key (recipe_id, ingredient_id)
);

alter table public.recipe_ingredients enable row level security;

-- Readable when the parent recipe is readable; writable only for your own.
drop policy if exists "recipe_ingredients: read through recipe" on public.recipe_ingredients;
create policy "recipe_ingredients: read through recipe"
  on public.recipe_ingredients for select
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and (r.owner_id is null or r.owner_id = (select auth.uid()))
  ));

drop policy if exists "recipe_ingredients: write through own recipe" on public.recipe_ingredients;
create policy "recipe_ingredients: write through own recipe"
  on public.recipe_ingredients for all
  using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
  ));

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.meal_plans enable row level security;

drop policy if exists "meal_plans: own rows" on public.meal_plans;
create policy "meal_plans: own rows"
  on public.meal_plans for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans on delete cascade,
  planned_on date not null,
  slot text not null check (slot in ('breakfast','lunch','pre_workout','dinner','snack')),
  recipe_id uuid references public.recipes on delete set null,
  servings numeric(4,2) not null default 1 check (servings > 0),
  eaten boolean not null default false,
  unique (plan_id, planned_on, slot)
);

create index if not exists meal_plan_entries_plan_date_idx
  on public.meal_plan_entries (plan_id, planned_on);

alter table public.meal_plan_entries enable row level security;

drop policy if exists "meal_plan_entries: through plan" on public.meal_plan_entries;
create policy "meal_plan_entries: through plan"
  on public.meal_plan_entries for all
  using (exists (
    select 1 from public.meal_plans p where p.id = plan_id and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.meal_plans p where p.id = plan_id and p.user_id = (select auth.uid())
  ));

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans on delete cascade,
  ingredient_id uuid not null references public.ingredients,
  total_grams numeric(8,1) not null check (total_grams > 0),
  checked boolean not null default false,
  unique (plan_id, ingredient_id)
);

alter table public.grocery_items enable row level security;

drop policy if exists "grocery_items: through plan" on public.grocery_items;
create policy "grocery_items: through plan"
  on public.grocery_items for all
  using (exists (
    select 1 from public.meal_plans p where p.id = plan_id and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.meal_plans p where p.id = plan_id and p.user_id = (select auth.uid())
  ));

create table if not exists public.user_excludes (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('allergen','ingredient','preference')),
  value text not null,
  primary key (user_id, kind, value)
);

alter table public.user_excludes enable row level security;

drop policy if exists "user_excludes: own rows" on public.user_excludes;
create policy "user_excludes: own rows"
  on public.user_excludes for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
