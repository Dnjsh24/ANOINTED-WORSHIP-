-- Add avatar_url to message_channels table to support channel-specific images/avatars
ALTER TABLE public.message_channels ADD COLUMN IF NOT EXISTS avatar_url text;
