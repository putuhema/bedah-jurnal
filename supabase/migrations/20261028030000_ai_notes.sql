-- Every "Tanya AI" answer is kept, like a note, whether or not it ends up on a stamp.
-- Visible only to the asker until the reveal (same rule as stamps).
create table public.ai_notes (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  seat text not null check (seat in ('a', 'b')),
  page int not null,
  quote text not null,
  rects jsonb not null,
  kind text not null check (kind in ('simpel', 'istilah', 'klaim')),
  answer text not null check (char_length(answer) <= 4000),
  created_at timestamptz not null default now()
);
create index ai_notes_edition_idx on public.ai_notes (edition_id, page);

alter table public.ai_notes enable row level security;
