insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'presentation-media',
  'presentation-media',
  true,
  5242880, -- 5MB limit
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read presentation media" on storage.objects;
create policy "Public can read presentation media"
on storage.objects for select
to public
using (bucket_id = 'presentation-media');

drop policy if exists "Authenticated users can upload presentation media" on storage.objects;
create policy "Authenticated users can upload presentation media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'presentation-media'
);

drop policy if exists "Authenticated users can update presentation media" on storage.objects;
create policy "Authenticated users can update presentation media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'presentation-media'
)
with check (
  bucket_id = 'presentation-media'
);

drop policy if exists "Authenticated users can delete presentation media" on storage.objects;
create policy "Authenticated users can delete presentation media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'presentation-media'
);
