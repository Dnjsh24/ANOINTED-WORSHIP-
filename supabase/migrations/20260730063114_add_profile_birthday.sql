-- The website profile editor and dashboard celebration query both persist and
-- read this field. Keep the migration repeatable for projects where the column
-- may already have been added manually.

alter table public.profiles
  add column if not exists birthday date;;
