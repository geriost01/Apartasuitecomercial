-- Extends the existing Aparta Suite La Flora schema without creating parallel tables.
-- Existing RLS policies still control inserts and reads by staff / apartment owner.
alter table public.bookings
  add column if not exists guest_name text not null default '',
  add column if not exists nightly_rate integer;

alter table public.bookings drop constraint if exists bookings_guest_name_length;
alter table public.bookings add constraint bookings_guest_name_length
  check (length(trim(guest_name)) <= 120);
alter table public.bookings drop constraint if exists bookings_nightly_rate_nonnegative;
alter table public.bookings add constraint bookings_nightly_rate_nonnegative
  check (nightly_rate is null or nightly_rate >= 0);

alter table public.statement_signing add column if not exists seal text;
alter table public.statement_signing drop constraint if exists statement_signing_seal_png;
alter table public.statement_signing add constraint statement_signing_seal_png
  check (seal is null or (length(seal) <= 480000 and seal ~ '^data:image/png;base64,[a-zA-Z0-9+/=]+$'));
alter table public.statements add column if not exists seal text;

-- Snapshot the authorized building seal alongside the existing signed statement.
create or replace function la_flora_private.close_commercial_month(unit_id integer, period date, apply_gmf boolean)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  result_id uuid;
  signing public.statement_signing%rowtype;
  month_end date;
begin
  if not public.la_flora_is_staff() then
    raise exception 'Se requiere acceso de administración.' using errcode = '42501';
  end if;
  if period is null or extract(day from period) <> 1 or period >= date_trunc('month', timezone('America/Bogota', now()))::date then
    raise exception 'Solo puedes cerrar meses anteriores.';
  end if;
  if apply_gmf is null then raise exception 'Indica si aplica el GMF.'; end if;
  perform pg_advisory_xact_lock(unit_id, -24100);
  select id into result_id from public.statements where apartment_id=unit_id and month=period;
  if found then return result_id; end if;
  if exists (select 1 from public.statements where apartment_id=unit_id and month>period) then
    raise exception 'Ya existe un cierre posterior. Registra los ajustes en el período abierto.';
  end if;
  if exists (
    select 1 from public.ledger l where l.apartment_id=unit_id and l.posted_on<period
      and l.category is distinct from 'admin_cost'
      and not exists (select 1 from public.statements s where s.apartment_id=unit_id and s.month=date_trunc('month',l.posted_on::timestamp)::date)
  ) then raise exception 'Cierra primero los meses anteriores que tienen movimientos.'; end if;
  select * into signing from public.statement_signing where id;
  if not found then raise exception 'Registra la firma de administración antes de emitir el estado de cuenta.'; end if;
  month_end := (period+interval '1 month')::date;
  insert into public.statements(apartment_id,month,lines,signer,signer_title,signature,seal,stays,financial)
  values (
    unit_id,period,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'posted_on',posted_on,'kind',kind,'amount',amount,'description',description,
      'category',category,'external_ref',external_ref,'channel_fee',channel_fee,'withheld',withheld,
      'bank_fee',bank_fee,'reversal_of',reversal_of
    ) order by posted_on,id) from public.ledger
      where apartment_id=unit_id and posted_on>=period and posted_on<month_end and category is distinct from 'admin_cost'), '[]'::jsonb),
    signing.signer,signing.title,signing.signature,signing.seal,
    coalesce((select jsonb_agg(jsonb_build_object(
      'arrival',arrival,'departure',departure,'channel',channel,'guests',guests,
      'guest_name',guest_name,'nightly_rate',nightly_rate,'amount',amount,
      'nights_in_month',least(departure,month_end)-greatest(arrival,period)
    ) order by arrival,id) from public.bookings
      where apartment_id=unit_id and status in ('checked_in','checked_out') and arrival<month_end and departure>period), '[]'::jsonb),
    la_flora_private.month_totals(unit_id,period,month_end,apply_gmf)
  ) returning id into result_id;
  return result_id;
end $$;
