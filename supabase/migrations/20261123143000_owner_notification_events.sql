create table if not exists public.owner_notification_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  sent_at timestamptz not null default now(),
  unique (booking_id, owner_id)
);
alter table public.owner_notification_events enable row level security;
revoke all on public.owner_notification_events from anon, authenticated;
