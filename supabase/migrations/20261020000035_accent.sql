-- JLIKA Gym — an accent colour per account.
--
-- Lime stays the default and the brand. The others are all light enough that
-- the dark label every accent button already uses keeps its contrast, so a
-- choice here never makes a button unreadable. The surfaces stay dark: the
-- design is dark-only, and this changes the highlight, not the room.

alter table public.profiles
  add column if not exists accent text not null default 'lime';

alter table public.profiles
  drop constraint if exists profiles_accent_check;
alter table public.profiles
  add constraint profiles_accent_check
  check (accent in ('lime', 'orange', 'yellow', 'coral', 'pink', 'violet', 'sky', 'mint'));
