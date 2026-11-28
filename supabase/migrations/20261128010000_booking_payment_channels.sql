-- Add payment method tracking and the booking channels exposed by the admin form.
alter table public.ledger
  add column if not exists payment_method text;

alter table public.ledger
  drop constraint if exists ledger_payment_method_check;

alter table public.ledger
  add constraint ledger_payment_method_check
  check (
    payment_method is null
    or payment_method = any (array[
      'Transferencia',
      'Efectivo',
      'Tarjeta',
      'PSE',
      'Plataforma de reservas',
      'Otro'
    ]::text[])
  );

-- Keep Directa and Bloqueo accepted for existing records and operational blocks.
alter table public.bookings
  drop constraint if exists bookings_channel_check;

alter table public.bookings
  add constraint bookings_channel_check
  check (channel = any (array[
    'Airbnb',
    'Directa',
    'Booking',
    'Redes sociales',
    'Expedia',
    'Otro',
    'Bloqueo'
  ]::text[]));
