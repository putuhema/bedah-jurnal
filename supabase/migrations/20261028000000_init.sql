-- Bedah Jurnal: schema
-- All reads and writes go through the Next.js server with the service-role key.
-- RLS is on with no policies, so the public (anon) key cannot touch any table.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  secret text not null unique,
  name_a text not null,
  name_b text not null,
  created_at timestamptz not null default now()
);

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  number int not null,
  title text not null,
  source text,
  pdf_path text not null,
  page_count int not null default 1,
  picked_by text not null check (picked_by in ('a', 'b')),
  revealed_at timestamptz,
  talk_index int not null default 0,
  talk_done_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, number)
);

create table public.progress (
  edition_id uuid not null references public.editions (id) on delete cascade,
  seat text not null check (seat in ('a', 'b')),
  page int not null default 1,
  done_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (edition_id, seat)
);

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  seat text not null check (seat in ('a', 'b')),
  page int not null,
  quote text not null,
  rects jsonb not null,
  reaction text not null check (reaction in ('wah', 'hmm', 'wkwk', 'hah', 'ide')),
  note text,
  created_at timestamptz not null default now()
);
create index marks_edition_idx on public.marks (edition_id, page);

create table public.learnings (
  edition_id uuid not null references public.editions (id) on delete cascade,
  seat text not null check (seat in ('a', 'b')),
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (edition_id, seat)
);

alter table public.rooms enable row level security;
alter table public.editions enable row level security;
alter table public.progress enable row level security;
alter table public.marks enable row level security;
alter table public.learnings enable row level security;

-- private bucket for the PDFs (accessed only through signed URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journals', 'journals', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
