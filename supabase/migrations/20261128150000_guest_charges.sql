-- Guest consumptions are distinct from owner expenses and cash receipts.
create table if not exists public.guest_charges (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  kind text not null check (kind in ('snack','cleaning','other')),
  description text not null check (char_length(btrim(description)) between 1 and 160),
  quantity integer not null check (quantity between 1 and 1000),
  unit_price integer not null check (unit_price between 0 and 100000000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  constraint guest_charges_void_pair check ((voided_at is null) = (voided_by is null))
);
create index if not exists guest_charges_booking_idx on public.guest_charges(booking_id,created_at);
alter table public.guest_charges enable row level security;
revoke all on public.guest_charges from anon, authenticated;
grant select on public.guest_charges to authenticated;
grant insert (booking_id,kind,description,quantity,unit_price) on public.guest_charges to authenticated;
grant update (voided_at,voided_by) on public.guest_charges to authenticated;

create policy guest_charges_staff_read on public.guest_charges for select to authenticated
  using ((select public.la_flora_is_staff()));
create policy guest_charges_staff_insert on public.guest_charges for insert to authenticated
  with check ((select public.la_flora_is_staff()) and created_by = (select auth.uid()) and exists (
    select 1 from public.bookings b where b.id=booking_id and b.status in ('confirmed','checked_in')
  ));
create policy guest_charges_staff_void on public.guest_charges for update to authenticated
  using ((select public.la_flora_is_staff()) and voided_at is null and exists (
    select 1 from public.bookings b where b.id=booking_id and b.status in ('confirmed','checked_in')
  ))
  with check ((select public.la_flora_is_staff()) and voided_at is not null and voided_by=(select auth.uid()));

-- Include consumptions in the same critical deletion preview and transaction.
create or replace function public.delete_operational_data(p_expected jsonb, p_confirmation text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_counts jsonb;
begin
  if p_confirmation is distinct from 'BORRAR TODO' then
    raise exception 'La confirmación crítica no coincide.';
  end if;
  lock table public.owner_requests, public.tasks, public.ledger, public.statements,
    public.guest_charges, public.bookings in access exclusive mode;
  select jsonb_build_object(
    'owner_requests', (select count(*) from public.owner_requests),
    'tasks', (select count(*) from public.tasks),
    'ledger', (select count(*) from public.ledger),
    'statements', (select count(*) from public.statements),
    'bookings', (select count(*) from public.bookings),
    'guest_charges', (select count(*) from public.guest_charges)
  ) into v_counts;
  if p_expected is distinct from v_counts then
    raise exception 'Los datos cambiaron desde la vista previa. Revisa el conteo.';
  end if;
  delete from public.owner_requests;
  delete from public.tasks;
  delete from public.statements;
  update public.ledger set reversal_of=null where reversal_of is not null;
  delete from public.ledger;
  delete from public.guest_charges;
  delete from public.bookings;
  return v_counts;
end;
$$;
revoke all on function public.delete_operational_data(jsonb,text) from public,anon,authenticated;
grant execute on function public.delete_operational_data(jsonb,text) to service_role;
