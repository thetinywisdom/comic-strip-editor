ALTER TABLE public.projects ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;

DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

CREATE POLICY "Shared single-workspace access" ON public.projects
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared project images read" ON storage.objects;
DROP POLICY IF EXISTS "Shared project images write" ON storage.objects;
DROP POLICY IF EXISTS "Shared project images update" ON storage.objects;
DROP POLICY IF EXISTS "Shared project images delete" ON storage.objects;

CREATE POLICY "Shared project images read" ON storage.objects
FOR SELECT TO anon, authenticated USING (bucket_id = 'project-images');
CREATE POLICY "Shared project images write" ON storage.objects
FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'project-images');
CREATE POLICY "Shared project images update" ON storage.objects
FOR UPDATE TO anon, authenticated USING (bucket_id = 'project-images') WITH CHECK (bucket_id = 'project-images');
CREATE POLICY "Shared project images delete" ON storage.objects
FOR DELETE TO anon, authenticated USING (bucket_id = 'project-images');