import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"

import { findTwins, isSameText } from "@/lib/overlap"
import { admin, PDF_BUCKET } from "@/lib/supabase/admin"
import {
  isSeat,
  otherSeat,
  type AiKind,
  type AiNote,
  type ChatMessage,
  type KamusEntry,
  type Edition,
  type Learning,
  type Mark,
  type Progress,
  type Room,
  type Seat,
} from "@/lib/types"

/* ---------- rows → app types ---------- */

type RoomRow = { id: string; secret: string; name_a: string; name_b: string }
type EditionRow = {
  id: string
  number: number
  kind: "pdf" | "article"
  title: string
  source: string | null
  source_url: string | null
  pdf_path: string | null
  page_count: number
  picked_by: Seat
  revealed_at: string | null
  talk_index: number
  talk_done_at: string | null
  archived_at: string | null
  created_at: string
}
type MarkRow = {
  id: string
  seat: Seat
  page: number
  quote: string
  rects: Mark["rects"]
  start_offset: number | null
  end_offset: number | null
  reaction: Mark["reaction"]
  note: string | null
  ai_kind: AiKind | null
  ai_answer: string | null
  created_at: string
}

function toRange(start: number | null, end: number | null) {
  return start != null && end != null && end > start ? { start, end } : null
}

function toRoom(r: RoomRow): Room {
  return { id: r.id, secret: r.secret, names: { a: r.name_a, b: r.name_b } }
}

function toEdition(r: EditionRow): Edition {
  return {
    id: r.id,
    number: r.number,
    kind: r.kind,
    title: r.title,
    source: r.source,
    sourceUrl: r.source_url,
    pdfPath: r.pdf_path,
    pageCount: r.page_count,
    pickedBy: r.picked_by,
    revealedAt: r.revealed_at,
    talkIndex: r.talk_index,
    talkDoneAt: r.talk_done_at,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
  }
}

function toMark(r: MarkRow): Mark {
  return {
    id: r.id,
    seat: r.seat,
    page: r.page,
    quote: r.quote,
    rects: r.rects,
    range: toRange(r.start_offset, r.end_offset),
    reaction: r.reaction,
    note: r.note,
    ai:
      r.ai_kind && r.ai_answer
        ? { kind: r.ai_kind, answer: r.ai_answer }
        : null,
    createdAt: r.created_at,
  }
}

const EDITION_COLUMNS =
  "id, number, kind, title, source, source_url, pdf_path, page_count, picked_by, revealed_at, talk_index, talk_done_at, archived_at, created_at"

/* ---------- room + seat ---------- */

export const getRoom = cache(async (secret: string): Promise<Room | null> => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(secret)) return null
  const { data, error } = await admin()
    .from("rooms")
    .select("id, secret, name_a, name_b")
    .eq("secret", secret)
    .maybeSingle<RoomRow>()
  if (error) throw error
  return data ? toRoom(data) : null
})

export function seatCookieName(roomId: string) {
  return `bj_seat_${roomId.replaceAll("-", "")}`
}

export async function getSeat(room: Room): Promise<Seat | null> {
  const value = (await cookies()).get(seatCookieName(room.id))?.value
  return isSeat(value) ? value : null
}

/** For server actions: resolve the room and the caller's seat, or throw. */
export async function requireRoomSeat(
  secret: string
): Promise<{ room: Room; seat: Seat }> {
  const room = await getRoom(secret)
  if (!room) throw new Error("Ruang tidak ditemukan.")
  const seat = await getSeat(room)
  if (!seat) throw new Error("Pilih dulu kamu siapa.")
  return { room, seat }
}

/* ---------- editions ---------- */

export const getEditions = cache(async (roomId: string): Promise<Edition[]> => {
  const { data, error } = await admin()
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("room_id", roomId)
    .order("number", { ascending: false })
    .returns<EditionRow[]>()
  if (error) throw error
  return (data ?? []).map(toEdition)
})

/** The edition you two are on now: the newest one that isn't archived. */
export async function getCurrentEdition(
  roomId: string
): Promise<Edition | null> {
  const editions = await getEditions(roomId)
  return editions.find((e) => !e.archivedAt) ?? null
}

export async function getEditionByNumber(
  roomId: string,
  number: number
): Promise<Edition | null> {
  const editions = await getEditions(roomId)
  return editions.find((e) => e.number === number) ?? null
}

export async function getEditionById(
  roomId: string,
  editionId: string
): Promise<Edition | null> {
  const { data, error } = await admin()
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("room_id", roomId)
    .eq("id", editionId)
    .maybeSingle<EditionRow>()
  if (error) throw error
  return data ? toEdition(data) : null
}

/** Whose turn it is to pick the next journal: the seat that didn't pick last time. */
export async function getNextPicker(roomId: string): Promise<Seat> {
  const [latest] = await getEditions(roomId)
  return latest ? otherSeat(latest.pickedBy) : "a"
}

/* ---------- progress ---------- */

export async function getProgress(
  editionId: string
): Promise<Record<Seat, Progress>> {
  const { data, error } = await admin()
    .from("progress")
    .select("seat, page, done_at")
    .eq("edition_id", editionId)
    .returns<{ seat: Seat; page: number; done_at: string | null }[]>()
  if (error) throw error
  const result: Record<Seat, Progress> = {
    a: { seat: "a", page: 1, doneAt: null },
    b: { seat: "b", page: 1, doneAt: null },
  }
  for (const row of data ?? []) {
    result[row.seat] = { seat: row.seat, page: row.page, doneAt: row.done_at }
  }
  return result
}

/* ---------- marks: the other seat's marks stay hidden until the reveal ---------- */

export async function getMarks(
  edition: Edition,
  seat: Seat
): Promise<{ marks: Mark[]; hiddenCount: number; twinCount: number }> {
  const { data, error } = await admin()
    .from("marks")
    .select(
      "id, seat, page, quote, rects, start_offset, end_offset, reaction, note, ai_kind, ai_answer, created_at"
    )
    .eq("edition_id", edition.id)
    .order("page", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<MarkRow[]>()
  if (error) throw error

  const all = (data ?? []).map(toMark)
  // only the number of shared sentences leaks before the reveal, never which ones
  const twinCount = findTwins(all).length
  if (edition.revealedAt) return { marks: all, hiddenCount: 0, twinCount }

  const mine = all.filter((m) => m.seat === seat)
  return { marks: mine, hiddenCount: all.length - mine.length, twinCount }
}

/** Just the counts per seat, safe to show before the reveal. */
export async function getMarkCounts(
  editionId: string
): Promise<Record<Seat, number>> {
  const { data, error } = await admin()
    .from("marks")
    .select("seat")
    .eq("edition_id", editionId)
    .returns<{ seat: Seat }[]>()
  if (error) throw error
  const counts: Record<Seat, number> = { a: 0, b: 0 }
  for (const row of data ?? []) counts[row.seat]++
  return counts
}

/* ---------- learnings ---------- */

export async function getLearnings(
  editionIds: string[]
): Promise<Record<string, Learning[]>> {
  if (editionIds.length === 0) return {}
  const { data, error } = await admin()
    .from("learnings")
    .select("edition_id, seat, body")
    .in("edition_id", editionIds)
    .returns<{ edition_id: string; seat: Seat; body: string }[]>()
  if (error) throw error
  const result: Record<string, Learning[]> = {}
  for (const row of data ?? []) {
    ;(result[row.edition_id] ??= []).push({ seat: row.seat, body: row.body })
  }
  return result
}

/* ---------- AI notes: the other seat's stay hidden until the reveal ---------- */

export async function getAiNotes(
  edition: Edition,
  seat: Seat
): Promise<AiNote[]> {
  let query = admin()
    .from("ai_notes")
    .select(
      "id, seat, page, quote, rects, start_offset, end_offset, kind, answer, created_at"
    )
    .eq("edition_id", edition.id)
    .order("created_at", { ascending: false })
    .limit(500)
  if (!edition.revealedAt) query = query.eq("seat", seat)
  const { data, error } = await query.returns<
    {
      id: string
      seat: Seat
      page: number
      quote: string
      rects: AiNote["rects"]
      start_offset: number | null
      end_offset: number | null
      kind: AiKind
      answer: string
      created_at: string
    }[]
  >()
  if (error) throw error
  return (data ?? []).map((n) => ({
    id: n.id,
    seat: n.seat,
    page: n.page,
    quote: n.quote,
    rects: n.rects,
    range: toRange(n.start_offset, n.end_offset),
    kind: n.kind,
    answer: n.answer,
    createdAt: n.created_at,
  }))
}

/* ---------- chat ---------- */

export async function getMessages(editionId: string): Promise<ChatMessage[]> {
  const { data, error } = await admin()
    .from("messages")
    .select("id, seat, body, page, created_at")
    .eq("edition_id", editionId)
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<
      {
        id: string
        seat: Seat
        body: string
        page: number | null
        created_at: string
      }[]
    >()
  if (error) throw error
  return (data ?? []).reverse().map((m) => ({
    id: m.id,
    seat: m.seat,
    body: m.body,
    page: m.page,
    createdAt: m.created_at,
  }))
}

/* ---------- pdf ---------- */

/** The cleaned-up article HTML (loaded only when someone opens the article). */
export async function getArticleHtml(edition: Edition): Promise<string> {
  const { data, error } = await admin()
    .from("editions")
    .select("article_html")
    .eq("id", edition.id)
    .single<{ article_html: string | null }>()
  if (error) throw error
  return data.article_html ?? ""
}

export async function getPdfUrl(edition: Edition): Promise<string> {
  if (!edition.pdfPath) return ""
  const { data, error } = await admin()
    .storage.from(PDF_BUCKET)
    .createSignedUrl(edition.pdfPath, 60 * 60 * 6)
  if (error) throw error
  return data.signedUrl
}

/* ---------- Kamus kita ---------- */

type KamusSource = {
  editionId: string
  seat: Seat
  page: number
  quote: string
  rects: Mark["rects"]
  range: Mark["range"]
  meaning: string | null
  note: string | null
  createdAt: string
}

/**
 * Every [hah?] stamp and every "artinya apa?" AI answer across the room's editions.
 * Your own are always included; your partner's once that edition is revealed.
 * The same text from both becomes one entry.
 */
export async function getKamus(room: Room, seat: Seat): Promise<KamusEntry[]> {
  const editions = await getEditions(room.id)
  if (editions.length === 0) return []
  const byId = new Map(editions.map((e) => [e.id, e]))
  const visible = (editionId: string, from: Seat) =>
    from === seat || Boolean(byId.get(editionId)?.revealedAt)

  const ids = editions.map((e) => e.id)
  const [marksRes, notesRes] = await Promise.all([
    admin()
      .from("marks")
      .select(
        "edition_id, seat, page, quote, rects, start_offset, end_offset, note, ai_answer, created_at"
      )
      .in("edition_id", ids)
      .eq("reaction", "hah")
      .returns<
        {
          edition_id: string
          seat: Seat
          page: number
          quote: string
          rects: Mark["rects"]
          start_offset: number | null
          end_offset: number | null
          note: string | null
          ai_answer: string | null
          created_at: string
        }[]
      >(),
    admin()
      .from("ai_notes")
      .select(
        "edition_id, seat, page, quote, rects, start_offset, end_offset, answer, created_at"
      )
      .in("edition_id", ids)
      .eq("kind", "istilah")
      .returns<
        {
          edition_id: string
          seat: Seat
          page: number
          quote: string
          rects: Mark["rects"]
          start_offset: number | null
          end_offset: number | null
          answer: string
          created_at: string
        }[]
      >(),
  ])
  if (marksRes.error) throw marksRes.error
  if (notesRes.error) throw notesRes.error

  const sources: KamusSource[] = [
    ...(marksRes.data ?? []).map((m) => ({
      editionId: m.edition_id,
      seat: m.seat,
      page: m.page,
      quote: m.quote,
      rects: m.rects,
      range: toRange(m.start_offset, m.end_offset),
      meaning: m.ai_answer,
      note: m.note,
      createdAt: m.created_at,
    })),
    ...(notesRes.data ?? []).map((n) => ({
      editionId: n.edition_id,
      seat: n.seat,
      page: n.page,
      quote: n.quote,
      rects: n.rects,
      range: toRange(n.start_offset, n.end_offset),
      meaning: n.answer,
      note: null,
      createdAt: n.created_at,
    })),
  ]
    .filter((s) => visible(s.editionId, s.seat))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const groups: {
    editionId: string
    first: KamusSource
    all: KamusSource[]
  }[] = []
  for (const source of sources) {
    const group = groups.find(
      (g) => g.editionId === source.editionId && isSameText(g.first, source)
    )
    if (group) group.all.push(source)
    else
      groups.push({ editionId: source.editionId, first: source, all: [source] })
  }

  return groups
    .map((g): KamusEntry => {
      const edition = byId.get(g.editionId)!
      const latestMeaning =
        [...g.all].reverse().find((s) => s.meaning)?.meaning ?? null
      const shortest = g.all.reduce((a, b) =>
        b.quote.length < a.quote.length ? b : a
      )
      return {
        id: `${g.editionId}:${g.first.page}:${g.first.createdAt}`,
        editionNumber: edition.number,
        editionTitle: edition.title,
        editionKind: edition.kind,
        page: g.first.page,
        quote: shortest.quote,
        meaning: latestMeaning,
        notes: g.all
          .filter((s) => s.note)
          .map((s) => ({ seat: s.seat, text: s.note! })),
        seats: [...new Set(g.all.map((s) => s.seat))],
        createdAt: g.all.at(-1)!.createdAt,
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
