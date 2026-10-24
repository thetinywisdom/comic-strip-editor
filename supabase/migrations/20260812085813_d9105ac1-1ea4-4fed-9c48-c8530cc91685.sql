REVOKE EXECUTE ON FUNCTION public.current_email() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_allowed() TO authenticated;