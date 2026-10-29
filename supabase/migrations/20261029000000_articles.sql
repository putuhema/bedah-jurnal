-- An edition can be a PDF (uploaded or fetched from a link) or a web article.
-- Articles are stored as cleaned-up HTML, so they keep working if the site changes.
alter table public.editions
  add column kind text not null default 'pdf' check (kind in ('pdf', 'article')),
  add column source_url text,
  add column article_html text,
  add column article_text text,
  alter column pdf_path drop not null;

alter table public.editions
  add constraint editions_kind_content check (
    (kind = 'pdf' and pdf_path is not null) or
    (kind = 'article' and article_html is not null)
  );

-- Stamps and AI answers on articles are anchored by character offsets in the
-- article's text (layout-independent), instead of rectangles on a PDF page.
alter table public.marks
  add column start_offset int,
  add column end_offset int;
alter table public.ai_notes
  add column start_offset int,
  add column end_offset int;
