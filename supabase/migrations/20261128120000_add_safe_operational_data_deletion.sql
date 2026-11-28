create or replace function public.delete_operational_data(p_expected jsonb, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counts jsonb;
begin
  if p_confirmation is distinct from 'BORRAR TODO' then
    raise exception 'La confirmación crítica no coincide.';
  end if;

  lock table public.owner_requests, public.tasks, public.ledger, public.statements, public.bookings in access exclusive mode;

  select jsonb_build_object(
    'owner_requests', (select count(*) from public.owner_requests),
    'tasks', (select count(*) from public.tasks),
    'ledger', (select count(*) from public.ledger),
    'statements', (select count(*) from public.statements),
    'bookings', (select count(*) from public.bookings)
  ) into v_counts;

  if p_expected is distinct from v_counts then
    raise exception 'Los datos cambiaron desde la vista previa. Vuelve a revisar el conteo antes de borrar.';
  end if;

  delete from public.owner_requests;
  delete from public.tasks;
  delete from public.statements;
  update public.ledger set reversal_of = null where reversal_of is not null;
  delete from public.ledger;
  delete from public.bookings;

  return v_counts;
end;
$$;

revoke all on function public.delete_operational_data(jsonb, text) from public, anon, authenticated;
grant execute on function public.delete_operational_data(jsonb, text) to service_role;
