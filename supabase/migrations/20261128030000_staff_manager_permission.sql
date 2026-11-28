alter table public.staff add column if not exists can_manage_staff boolean not null default true;
create or replace function public.la_flora_can_manage_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.staff
    where user_id = (select auth.uid()) and can_manage_staff = true
  );
$$;
revoke all on function public.la_flora_can_manage_staff() from public;
grant execute on function public.la_flora_can_manage_staff() to authenticated;
