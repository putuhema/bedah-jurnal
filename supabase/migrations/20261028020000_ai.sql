-- "Tanya AI": the answer is saved on the stamp it belongs to, so it stays
-- hidden with the stamp until the reveal.
alter table public.marks
  add column ai_kind text check (ai_kind in ('simpel', 'istilah', 'klaim')),
  add column ai_answer text check (char_length(ai_answer) <= 4000);

-- One row per AI question, for the per-room daily limit.
create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  seat text not null check (seat in ('a', 'b')),
  created_at timestamptz not null default now()
);
create index ai_requests_room_idx on public.ai_requests (room_id, created_at);

alter table public.ai_requests enable row level security;
