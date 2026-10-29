-- Chat messages, one thread per edition. Same rule as the other tables:
-- RLS on with no policies, so only the server (secret key) can read or write.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  seat text not null check (seat in ('a', 'b')),
  body text not null check (char_length(body) between 1 and 1000),
  page int,
  created_at timestamptz not null default now()
);
create index messages_edition_idx on public.messages (edition_id, created_at);

alter table public.messages enable row level security;
