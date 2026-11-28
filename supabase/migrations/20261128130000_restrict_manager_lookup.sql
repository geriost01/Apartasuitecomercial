-- Anonymous callers do not need the privileged staff-manager lookup.
revoke execute on function public.la_flora_can_manage_staff() from anon;
