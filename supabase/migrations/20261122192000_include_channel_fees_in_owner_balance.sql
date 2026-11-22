-- Keep the signed owner balance consistent with the fee and withholding lines shown on statements.
create or replace function la_flora_private.month_totals(unit_id integer, start_on date, end_on date, apply_gmf boolean)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with monthly as (
    select date_trunc('month', posted_on::timestamp)::date as month,
      coalesce(sum(amount * case when reversal_of is null then 1 else -1 end) filter (where kind='receipt'),0) as received,
      coalesce(sum(channel_fee * case when reversal_of is null then 1 else -1 end) filter (where kind='receipt'),0) as channel_fees,
      coalesce(sum(withheld * case when reversal_of is null then 1 else -1 end) filter (where kind='receipt'),0) as withheld,
      coalesce(sum(amount * case when reversal_of is null then 1 else -1 end) filter (where kind='refund'),0) as refunded,
      coalesce(sum(amount * case when reversal_of is null then 1 else -1 end) filter (where kind='expense' and category='cleaning'),0) as cleaning,
      coalesce(sum(amount * case when reversal_of is null then 1 else -1 end) filter (where kind='expense' and category='supplies'),0) as supplies,
      coalesce(sum(amount * case when reversal_of is null then 1 else -1 end) filter (where kind='expense' and (category is null or category='owner_extra')),0) as extras,
      coalesce(sum(amount * case when reversal_of is null then 1 else -1 end) filter (where kind='payout'),0) as paid,
      coalesce(sum(bank_fee * case when reversal_of is null then 1 else -1 end) filter (where kind='payout'),0) as gmf_paid
    from public.ledger where apartment_id=unit_id and posted_on<end_on
    group by 1
  ), fees as (
    select *, round((received-refunded)::numeric/5)::bigint as commission
    from monthly
  ), rollup as (
    select
      coalesce(sum(received-refunded-commission-cleaning-supplies-extras-paid-gmf_paid-channel_fees-withheld) filter (where month<start_on),0) as opening,
      coalesce(sum(received) filter (where month>=start_on),0) as received,
      coalesce(sum(channel_fees) filter (where month>=start_on),0) as channel_fees,
      coalesce(sum(withheld) filter (where month>=start_on),0) as withheld,
      coalesce(sum(refunded) filter (where month>=start_on),0) as refunded,
      coalesce(sum(commission) filter (where month>=start_on),0) as commission,
      coalesce(sum(cleaning) filter (where month>=start_on),0) as cleaning,
      coalesce(sum(supplies) filter (where month>=start_on),0) as supplies,
      coalesce(sum(extras) filter (where month>=start_on),0) as extras,
      coalesce(sum(paid) filter (where month>=start_on),0) as paid,
      coalesce(sum(gmf_paid) filter (where month>=start_on),0) as gmf_paid
    from fees
  ), balance as (
    select *, opening+received-refunded-channel_fees-withheld-commission-cleaning-supplies-extras-paid-gmf_paid as balance
    from rollup
  ), estimate as (
    select *, case when apply_gmf then floor((greatest(balance,0)*1000+499)/1004)
      else greatest(balance,0) end as suggested
    from balance
  )
  select to_jsonb(estimate) || jsonb_build_object(
    'commission_rate',20,'gmf_estimated',greatest(balance,0)-suggested,'gmf_applies',apply_gmf
  ) from estimate
$function$;
