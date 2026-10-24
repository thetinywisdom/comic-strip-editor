DROP POLICY IF EXISTS "Shared project images read" ON storage.objects;
DROP POLICY IF EXISTS "Shared project images write" ON storage.objects;
DROP POLICY IF EXISTS "Shared project images update" ON storage.objects;
DROP POLICY IF EXISTS "Shared project images delete" ON storage.objects;

CREATE POLICY "Allowed users read project images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-images' AND public.is_allowed());
CREATE POLICY "Allowed users write project images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-images' AND public.is_allowed());
CREATE POLICY "Allowed users update project images" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-images' AND public.is_allowed());
CREATE POLICY "Allowed users delete project images" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-images' AND public.is_allowed());