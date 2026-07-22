-- Migrate existing single ministry to array
alter table public.team_members add column if not exists ministries text[] default '{}';
update public.team_members set ministries = array[ministry] where ministry is not null and ministry != '';

-- We can keep the old 'ministry' column for a bit just to prevent downtime,
-- or we can drop it if we update the code first.
