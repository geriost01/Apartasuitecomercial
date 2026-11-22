-- Completes the existing owner request workflow without creating parallel tables.
-- Owners may submit pending requests; only staff may change their status or response.
alter table public.owner_requests
  add constraint owner_requests_stay_dates check (
    kind <> 'stay' or (arrival is not null and departure is not null and departure > arrival)
  );

grant insert on public.owner_requests to authenticated;
grant update on public.owner_requests to authenticated;

drop policy if exists request_create on public.owner_requests;
create policy request_create on public.owner_requests
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.la_flora_can_read(apartment_id)
    and status = 'pending'
    and response is null
    and booking_id is null
    and ((kind = 'stay' and arrival >= timezone('America/Bogota', now())::date)
      or (kind <> 'stay' and arrival is null and departure is null))
    and (ledger_id is null or exists (
      select 1 from public.ledger l
      where l.id = owner_requests.ledger_id
        and l.apartment_id = owner_requests.apartment_id
        and l.category is distinct from 'admin_cost'
    ))
  );

drop policy if exists request_staff_update on public.owner_requests;
create policy request_staff_update on public.owner_requests
  for update to authenticated
  using ((select public.la_flora_is_staff()))
  with check ((select public.la_flora_is_staff()));
