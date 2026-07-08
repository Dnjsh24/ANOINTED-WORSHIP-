-- Drop the broad SELECT policy on storage.objects for the profile-avatars bucket
-- This prevents users from being able to list all files in the bucket.
-- Since the bucket is public, object URL access remains fully functional.
drop policy if exists "Public can read profile avatars" on storage.objects;
