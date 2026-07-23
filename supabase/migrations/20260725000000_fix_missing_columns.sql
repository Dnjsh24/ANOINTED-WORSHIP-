-- 1. Create missing tables FIRST to avoid foreign key errors
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.setlist_change_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setlist_id uuid NOT NULL REFERENCES public.setlists(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES public.profiles(id),
  change_type text NOT NULL,
  summary text NOT NULL,
  snapshot jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlist_change_log ENABLE ROW LEVEL SECURITY;

-- 3. Add columns safely using DO block to avoid syntax errors
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'ministries') THEN
    ALTER TABLE public.team_members ADD COLUMN ministries text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'team_anniversary') THEN
    ALTER TABLE public.team_members ADD COLUMN team_anniversary date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'custom_role_id') THEN
    ALTER TABLE public.team_members ADD COLUMN custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'setlist_songs' AND column_name = 'arrangement') THEN
    ALTER TABLE public.setlist_songs ADD COLUMN arrangement text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'parent_message_id') THEN
    ALTER TABLE public.messages ADD COLUMN parent_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create Policies Safely using DROP POLICY IF EXISTS
DROP POLICY IF EXISTS "Team members can view custom roles" ON public.custom_roles;
CREATE POLICY "Team members can view custom roles" ON public.custom_roles
  FOR SELECT USING (team_id IN (SELECT team_id FROM public.team_members WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage custom roles" ON public.custom_roles;
CREATE POLICY "Admins can manage custom roles" ON public.custom_roles
  FOR ALL USING (team_id IN (SELECT team_id FROM public.team_members WHERE profile_id = auth.uid() AND role IN ('owner','admin','pastor')));

DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions
  FOR ALL USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Team members can view changelog" ON public.setlist_change_log;
CREATE POLICY "Team members can view changelog" ON public.setlist_change_log
  FOR SELECT USING (team_id IN (SELECT team_id FROM public.team_members WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS "System can insert changelog" ON public.setlist_change_log;
CREATE POLICY "System can insert changelog" ON public.setlist_change_log
  FOR INSERT WITH CHECK (team_id IN (SELECT team_id FROM public.team_members WHERE profile_id = auth.uid()));
