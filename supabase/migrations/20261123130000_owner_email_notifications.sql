create table if not exists public.owner_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  verified_at timestamptz,
  verification_hash text,
  verification_expires_at timestamptz,
  reservation_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.owner_notification_preferences enable row level security;
drop policy if exists owner_notification_read_self on public.owner_notification_preferences;
create policy owner_notification_read_self on public.owner_notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists owner_notification_insert_self on public.owner_notification_preferences;
create policy owner_notification_insert_self on public.owner_notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()) and verified_at is null and verification_hash is null);
drop policy if exists owner_notification_update_self on public.owner_notification_preferences;
create policy owner_notification_update_self on public.owner_notification_preferences
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.owner_notification_preferences from anon;
grant select on public.owner_notification_preferences to authenticated;
grant insert (user_id, email, reservation_alerts) on public.owner_notification_preferences to authenticated;
grant update (email, reservation_alerts, updated_at) on public.owner_notification_preferences to authenticated;
