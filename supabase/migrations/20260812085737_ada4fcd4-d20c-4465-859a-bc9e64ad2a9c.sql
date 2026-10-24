CREATE TABLE public.allowed_emails (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.allowed_emails TO authenticated;
GRANT ALL ON public.allowed_emails TO service_role;

ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

INSERT INTO public.allowed_emails (email) VALUES ('brian@thetinywisdom.com');

CREATE OR REPLACE FUNCTION public.current_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''))
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_email() = 'brian@thetinywisdom.com'
$$;

CREATE OR REPLACE FUNCTION public.is_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_emails a WHERE a.email = public.current_email()
  )
$$;

CREATE POLICY "Allowed users can view the access list"
ON public.allowed_emails FOR SELECT TO authenticated
USING (public.is_allowed());

CREATE POLICY "Admin can add emails"
ON public.allowed_emails FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admin can remove emails"
ON public.allowed_emails FOR DELETE TO authenticated
USING (public.is_admin() AND email <> 'brian@thetinywisdom.com');

DROP POLICY IF EXISTS "Shared single-workspace access" ON public.projects;

CREATE POLICY "Allowed users share the workspace"
ON public.projects FOR ALL TO authenticated
USING (public.is_allowed())
WITH CHECK (public.is_allowed());

REVOKE ALL ON public.projects FROM anon;