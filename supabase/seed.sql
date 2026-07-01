insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alex.member@example.com',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Alex Morgan"}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'casey.member@example.com',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Casey Lee"}'::jsonb,
    now(),
    now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'jordan.member@example.com',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Jordan Reed"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, full_name, email)
values
  ('11111111-1111-1111-1111-111111111111', 'Alex Morgan', 'alex.member@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Casey Lee', 'casey.member@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'Jordan Reed', 'jordan.member@example.com')
on conflict (id) do update
set full_name = excluded.full_name,
    email = excluded.email;

insert into public.teams (id, name, code, owner_id)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Demo Worship Team',
  'DM-10001',
  '11111111-1111-1111-1111-111111111111'
)
on conflict (id) do nothing;

insert into public.team_members (id, team_id, profile_id, role, ministry)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', 'Worship Leader'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'band_member', 'Vocals'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'band_member', 'Guitar')
on conflict (team_id, profile_id) do nothing;

insert into public.songs (id, team_id, title, artist, original_key, bpm, time_signature, lyrics_chords, tags, created_by)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Classic Song', 'Demo Writer', 'G', 76, '4/4', 'G Em\nSample classic line one\nC\nSample classic line two\nD\nSample classic line three', array['Classic','Worship'], '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Opening Song', 'Demo Writer', 'B', 90, '4/4', 'B\nOpening line for the demo verse\nE\nSecond line for the demo verse', array['Praise','Upbeat'], '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Closing Song', 'Demo Writer', 'F', 66, '4/4', 'F\nSample declaration line one\nC G Am\nSample declaration line two', array['Declaration','Anthem'], '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.events (id, team_id, type, name, event_date, starts_at, ends_at, location, call_time, rehearsal_time, created_by)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'service',
  'Sunday Morning Worship',
  '2026-07-12',
  '09:00',
  '12:30',
  'Main Sanctuary',
  '08:00',
  '08:15',
  '11111111-1111-1111-1111-111111111111'
)
on conflict (id) do nothing;

insert into public.setlists (id, team_id, event_id, name, setlist_date, location, call_time, rehearsal_time, service_times, leader_member_id, created_by)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Sunday Service',
  '2026-07-12',
  'Main Sanctuary',
  '08:00',
  '08:15',
  array['09:00 AM', '11:00 AM'],
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  '11111111-1111-1111-1111-111111111111'
)
on conflict (id) do nothing;

insert into public.setlist_songs (setlist_id, song_id, song_order, assigned_key, lead_member_id)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 1, 'B', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 2, 'G', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', 3, 'F', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1')
on conflict (setlist_id, song_order) do nothing;
