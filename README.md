# Bedah Jurnal

A private reading room for two. One journal a week: each of you stamps sentences while reading, the stamps stay secret until you're both done, then you open them together and talk through them card by card.

Next.js 16 · shadcn/ui on Base UI · Tailwind v4 · Supabase (Postgres, Storage, Realtime) · pdf.js

## How it works

- **Room link = key.** `/` creates a room and gives you a secret link (`/r/<secret>`). Whoever has the link can join, so send it only to your partner. Each phone picks a seat once ("Kamu siapa?"), and an httpOnly cookie remembers the choice.
- **Shelf (`Rak`)** shows this week's journal, both reading bars, how many of the other person's stamps are still secret, and past editions with your "Kita belajar hari ini" lines.
- **Reading room (`Ruang`)**: the PDF is rendered by pdf.js with a selectable text layer. Select text, then pick a stamp `[wah!] [hmm] [wkwk] [hah?] [ide!]` and add an optional note. You can see where the other person is reading, and **Sini dong** invites them to your page. **Aku selesai** marks you as done and pings them.
- **Obrolan (chat)**: a side panel in the reading room, opened with the chat button or `C`. On wide screens it sits beside the PDF; on phones it slides over the right side. Each edition has its own thread, saved in the database and delivered live. Every message carries the sender's page, so tapping "hal N" jumps there. While the panel is closed, new messages show an unread count and a toast.
- **Zoom**: pinch the paper with two fingers (up to 4×), or tap the zoom button / press `Z` for 1× / 1.5× / 2×. The reader has its own scroll area, so zoomed pages pan sideways as well as up and down. Pages far off-screen give their canvas back, so long papers stay light on phones.
- **Floating nav**: Rak / Ruang / Ngobrol / Kamus in a glass bar (Motion). The chevron folds it into one small button; the choice is remembered per phone. The Ngobrol tab appears once you've finished reading. In the reader, **Sini dong** and **Aku selesai** float above it (Aku selesai asks once before it locks your stamps).
- **Ganti bacaan**: on the shelf, before the reveal, either of you can drop this week's reading (stamps, notes and chat go with it) and pick another.
- **Install as an app (PWA)**: "Add to Home Screen" from inside your room opens that room directly. On iPhone the installed app keeps its own cookies, so it asks "Kamu siapa?" once.
- **Tanya AI**: in the stamp card, ask Claude about the selected sentence: *jelasin simpel*, *artinya apa?*, or *klaim kuat nggak?*. The answer streams in, grounded in the surrounding page text, and is saved on the stamp you pick, so it stays hidden until the reveal and shows up in talk time. After the reveal you can still select text just to ask. Configure it with four variables: `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. It works with **any OpenAI-compatible provider** (OpenRouter, Groq, DeepSeek, Together, OpenAI, or a local Ollama/LM Studio) or with Claude directly (`LLM_PROVIDER=anthropic`: `claude-opus-5-5` at low effort by default, server-side refusal fallbacks, cached system prompt). See `.env.example` for the base URLs. It's capped at `AI_DAILY_LIMIT` questions per room per day. Without either, the buttons are hidden.
- **Sama!**: sentences you both stamped are detected at the reveal. Before it, the dialog only says how many ("Psst: ada 1 kalimat…"). After it, a "Sama!" dialog shows them, and talk time opens with a shared card either of you can move past.
- **Three ways to add this week's reading** (the "Tambah jurnal" dialog):
  - *Pilihkan*: type a topic in any language ("tidur", "kucing"). The AI turns it into English keywords, and [OpenAlex](https://openalex.org) returns open-access papers. Each suggestion is **checked before it's shown**: the PDF if it downloads, otherwise the readable article page. Many publishers (MDPI, Wiley, ScienceDirect…) block automated downloads, and those are skipped.
  - *Tempel link*: a PDF, a journal page (its `citation_pdf_url` PDF is used when it downloads), or any web article. A copy is always saved, so it keeps working if the link changes.
  - *Upload PDF*: as before.
- **Articles**: web articles are cleaned up (Readability + an allow-list sanitizer: no scripts, menus or ads) and read like PDFs, with stamps, notes, Tanya AI, the reveal, "Sama!", talk time and chat. Article stamps are anchored by character offsets in the text, so highlights line up on any screen size. Progress is shown as % read.
- **Kamus kita** (tab): every `[hah?]` stamp and every "artinya apa?" AI answer, merged per sentence, searchable, with links back to the spot. Your own entries are always there; your partner's appear after that edition's reveal.
- **Reveal**: once you're both done, either of you can press **Buka bareng**, and all stamps show up on both phones.
- **Talk time (`Ngobrol`)**: stamps become cards that alternate between you, in reading order. Only the card's owner can move on. At the end each of you writes one line, then **Simpan ke arsip**.

### Secrecy and safety

- The browser never talks to the database. All reads and writes go through server actions using the Supabase secret key, and every action re-checks the room secret and your seat.
- RLS is enabled with **no policies**, so the public key cannot read or write any table.
- The other person's marks are filtered out on the server until `revealed_at` is set. Realtime only sends "something changed" signals, never mark content.
- PDFs live in a private bucket. They are uploaded through a one-time signed upload URL and read through signed URLs that expire after 6 hours.

## Run it locally

Requires Node 22+, pnpm and Docker.

```bash
pnpm install
npx supabase start -x gotrue,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npx supabase status -o env      # copy API_URL, PUBLISHABLE_KEY (or ANON_KEY), SECRET_KEY (or SERVICE_ROLE_KEY)
cp .env.example .env.local      # and fill it in
pnpm dev
```

The migrations in `supabase/migrations/` create the tables (including `messages` for chat) and the private `journals` bucket. After pulling new migrations, run `npx supabase migration up`.

### End-to-end test

`e2e/flow.mjs` plays both people (two browser contexts) through a full edition: create a room, upload, stamp (with a note), zoom and pan, check the secrecy, "Sini dong", chat, finish, reveal, talk in turns, write learnings, archive. It uses your installed Google Chrome.

```bash
python3 scripts/make-sample-pdf.py   # writes e2e/sample.pdf
pnpm dev                              # in another terminal
node e2e/flow.mjs                     # screenshots land in e2e/screens/
```

To also test Tanya AI without a real key, run the fake AI server (it speaks both the OpenAI-compatible and the Claude format) and point the app at it:

```bash
node e2e/mock-ai.mjs                                            # :4010
# OpenAI-compatible
LLM_PROVIDER=openai-compatible LLM_BASE_URL=http://localhost:4010/v1 LLM_API_KEY=test-key LLM_MODEL=mock-model pnpm dev
# …or Claude
LLM_PROVIDER=anthropic LLM_BASE_URL=http://localhost:4010 LLM_API_KEY=test-key pnpm dev

AI_E2E=1 LLM_MODEL=mock-model node e2e/flow.mjs   # LLM_MODEL only for the openai-compatible run
```

To check the real provider in `.env.local` (spends one small request): `node e2e/live-ai.mjs`.

`e2e/sources.mjs` covers adding editions (Pilihkan, journal link, article link, blocked site), reading and stamping an article, "Sama!" and talk time on an article, and Kamus kita. It needs the fake server plus `ALLOW_PRIVATE_URLS=1 OPENALEX_URL=http://localhost:4010/openalex` on the app. `node e2e/live-sources.mjs` checks the same paths against the real internet (OpenAlex, Frontiers, Wikipedia).

## Deploy (Vercel + Supabase)

1. Create a Supabase project, then run the migration with `npx supabase link` and `npx supabase db push` (or paste the SQL into the SQL editor).
2. Import the repo in Vercel and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and optionally `ROOM_CREATE_CODE`, so strangers can't create rooms on your deployment.
3. Open the site, create your room, and send the link to your partner.

## Not in v1 (on purpose)

- AI-written talk cards and `@ai` in the chat
- Push notifications while the app is closed. Right now the "finished reading" ping is an in-app toast, plus a browser notification if the tab is open in the background and notifications are allowed.
- Replies on notes, filters, custom stamps, exports

## Design

Tokens come from `../design-system/` (the Zedative flavor with a plain background): IBM Plex Serif italic for headlines, IBM Plex Mono for the interface, 4px corners and 150ms motion. Putu is blue `#1348dc` and S is violet `#a449ab`. The shadcn components in `components/ui` were adjusted to match: hairline rings instead of shadows, an inset lip on buttons, and dialog titles in the serif.
