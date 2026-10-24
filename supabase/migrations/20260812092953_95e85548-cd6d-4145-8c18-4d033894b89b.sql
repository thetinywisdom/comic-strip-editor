REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO postgres, service_role;