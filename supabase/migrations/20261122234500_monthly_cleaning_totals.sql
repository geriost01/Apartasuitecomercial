-- Aseo e insumos operativos se registran como un acumulado mensual por suite.
-- El formulario usa el primer día del mes como fecha canónica del movimiento.
create unique index if not exists ledger_monthly_cleaning_totals_unique
  on public.ledger (apartment_id, category, posted_on)
  where kind = 'expense' and category in ('cleaning', 'supplies');
