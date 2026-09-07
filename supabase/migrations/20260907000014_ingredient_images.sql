-- JLIKA Gym — ingredient photos.
--
-- Meals and the grocery list read better with a picture, and on a shopping list
-- a photo is genuinely faster to scan than a word.
--
-- Sourced from TheMealDB's ingredient images. Each one was checked against a
-- contact sheet before being seeded; four of the thirty-eight showed the wrong
-- food (whey protein as a bottle of milk, cottage cheese as a hard cheese
-- wedge, rolled oats as a box of oatmeal cookies, egg whites as a whole egg)
-- and are deliberately left null. FoodThumb draws a category tile for those —
-- no picture is better than a misleading one.
--
-- Hotlinked for now, like the exercise photos. Mirror both into Supabase
-- Storage before this serves real traffic, and check TheMealDB's terms if this
-- ever stops being a private app.

alter table public.ingredients
  add column if not exists image_url text;

update public.ingredients as i
set image_url = v.url
from (values
  ('chicken-breast', 'https://www.themealdb.com/images/ingredients/Chicken%20Breast-Small.png'),
  ('salmon-fillet', 'https://www.themealdb.com/images/ingredients/Salmon-Small.png'),
  ('lean-beef-mince', 'https://www.themealdb.com/images/ingredients/Minced%20Beef-Small.png'),
  ('turkey-mince', 'https://www.themealdb.com/images/ingredients/Turkey%20Mince-Small.png'),
  ('eggs', 'https://www.themealdb.com/images/ingredients/Eggs-Small.png'),
  ('greek-yogurt', 'https://www.themealdb.com/images/ingredients/Greek%20Yogurt-Small.png'),
  ('tofu-firm', 'https://www.themealdb.com/images/ingredients/Tofu-Small.png'),
  ('prawns', 'https://www.themealdb.com/images/ingredients/Prawns-Small.png'),
  ('tuna-tinned', 'https://www.themealdb.com/images/ingredients/Tuna-Small.png'),
  ('basmati-rice', 'https://www.themealdb.com/images/ingredients/Basmati%20Rice-Small.png'),
  ('sweet-potato', 'https://www.themealdb.com/images/ingredients/Sweet%20Potatoes-Small.png'),
  ('potato', 'https://www.themealdb.com/images/ingredients/Potatoes-Small.png'),
  ('wholemeal-bread', 'https://www.themealdb.com/images/ingredients/Bread-Small.png'),
  ('wholewheat-pasta', 'https://www.themealdb.com/images/ingredients/Spaghetti-Small.png'),
  ('couscous', 'https://www.themealdb.com/images/ingredients/Couscous-Small.png'),
  ('chickpeas', 'https://www.themealdb.com/images/ingredients/Chickpeas-Small.png'),
  ('black-beans', 'https://www.themealdb.com/images/ingredients/Black%20Beans-Small.png'),
  ('broccoli', 'https://www.themealdb.com/images/ingredients/Broccoli-Small.png'),
  ('spinach', 'https://www.themealdb.com/images/ingredients/Spinach-Small.png'),
  ('tomatoes', 'https://www.themealdb.com/images/ingredients/Tomatoes-Small.png'),
  ('mixed-peppers', 'https://www.themealdb.com/images/ingredients/Red%20Pepper-Small.png'),
  ('courgette', 'https://www.themealdb.com/images/ingredients/Courgettes-Small.png'),
  ('onion', 'https://www.themealdb.com/images/ingredients/Onion-Small.png'),
  ('garlic', 'https://www.themealdb.com/images/ingredients/Garlic-Small.png'),
  ('banana', 'https://www.themealdb.com/images/ingredients/Banana-Small.png'),
  ('berries-frozen', 'https://www.themealdb.com/images/ingredients/Blueberries-Small.png'),
  ('apple', 'https://www.themealdb.com/images/ingredients/Apple-Small.png'),
  ('avocado', 'https://www.themealdb.com/images/ingredients/Avocado-Small.png'),
  ('olive-oil', 'https://www.themealdb.com/images/ingredients/Olive%20Oil-Small.png'),
  ('almonds', 'https://www.themealdb.com/images/ingredients/Almonds-Small.png'),
  ('peanut-butter', 'https://www.themealdb.com/images/ingredients/Peanut%20Butter-Small.png'),
  ('soy-sauce', 'https://www.themealdb.com/images/ingredients/Soy%20Sauce-Small.png'),
  ('honey', 'https://www.themealdb.com/images/ingredients/Honey-Small.png'),
  ('mixed-spices', 'https://www.themealdb.com/images/ingredients/Mixed%20Spice-Small.png')
) as v(slug, url)
where i.slug = v.slug and i.owner_id is null;
