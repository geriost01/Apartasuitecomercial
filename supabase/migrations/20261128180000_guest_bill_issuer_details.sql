alter table public.statement_signing
  add column if not exists issuer_name text not null default 'Aparta Suite La Flora',
  add column if not exists issuer_document text,
  add column if not exists issuer_address text,
  add column if not exists issuer_city text not null default 'Cali';
