DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.allowed_emails
  ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'user';

INSERT INTO public.allowed_emails (email, role)
VALUES ('brian@thetinywisdom.com', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.current_email() = 'brian@thetinywisdom.com'
     OR EXISTS (
       SELECT 1 FROM public.allowed_emails a
       WHERE a.email = public.current_email() AND a.role = 'admin'
     )
$function$;

-- access list: admin-only visibility and management
DROP POLICY IF EXISTS "Allowed users can view the access list" ON public.allowed_emails;
CREATE POLICY "Admins can view the access list"
  ON public.allowed_emails FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can update roles" ON public.allowed_emails;
CREATE POLICY "Admin can update roles"
  ON public.allowed_emails FOR UPDATE TO authenticated
  USING (public.is_admin() AND email <> 'brian@thetinywisdom.com')
  WITH CHECK (public.is_admin() AND email <> 'brian@thetinywisdom.com');

-- projects: everyone allowed can read/create/edit, only admins delete
DROP POLICY IF EXISTS "Allowed users share the workspace" ON public.projects;

CREATE POLICY "Allowed users can view projects"
  ON public.projects FOR SELECT TO authenticated
  USING (public.is_allowed());

CREATE POLICY "Allowed users can create projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_allowed());

CREATE POLICY "Allowed users can edit projects"
  ON public.projects FOR UPDATE TO authenticated
  USING (public.is_allowed())
  WITH CHECK (public.is_allowed());

CREATE POLICY "Admins can delete projects"
  ON public.projects FOR DELETE TO authenticated
  USING (public.is_admin());