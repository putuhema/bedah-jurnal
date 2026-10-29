"use server"

import { randomBytes, randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  getEditionById,
  getEditions,
  getMarks,
  getProgress,
  getRoom,
  requireRoomSeat,
  seatCookieName,
} from "@/lib/room"
import { admin, PDF_BUCKET } from "@/lib/supabase/admin"
import { searchKeywords } from "@/lib/ai"
import { ImportError, importUrl } from "@/lib/importer"
import { searchPapers } from "@/lib/papers"
import { buildDeck } from "@/lib/talk"
import { parseSpot } from "@/lib/validate"
import {
  isAiKind,
  isReaction,
  isSeat,
  type ChatMessage,
  type Rect,
  type Seat,
} from "@/lib/types"

export type ActionResult<T = null> =
  { ok: true; data: T } | { ok: false; error: string }

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn())
  } catch (error) {
    // redirect() works by throwing; let it through
    if (error && typeof error === "object" && "digest" in error) throw error
    const message = error instanceof Error ? error.message : "Ada yang salah."
    console.error("[action]", error)
    return { ok: false, error: message }
  }
}

function refresh(secret: string) {
  revalidatePath(`/r/${secret}`, "layout")
}

async function setSeatCookie(roomId: string, secret: string, seat: Seat) {
  ;(await cookies()).set(seatCookieName(roomId), seat, {
    path: `/r/${secret}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  })
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

/* ---------- room ---------- */

export type CreateRoomState = { error?: string }

export async function createRoom(
  _prev: CreateRoomState,
  formData: FormData
): Promise<CreateRoomState> {
  const nameA = cleanText(formData.get("nameA"), 24)
  const nameB = cleanText(formData.get("nameB"), 24)
  const code = cleanText(formData.get("code"), 100)

  if (!nameA || !nameB) return { error: "Isi dua nama dulu." }
  const required = process.env.ROOM_CREATE_CODE
  if (required && code !== required)
    return { error: "Kode pembuatan ruang salah." }

  const secret = randomBytes(18).toString("base64url")
  const { data, error } = await admin()
    .from("rooms")
    .insert({ secret, name_a: nameA, name_b: nameB })
    .select("id")
    .single<{ id: string }>()
  if (error) {
    console.error("[createRoom]", error)
    return { error: "Gagal bikin ruang. Cek koneksi ke database." }
  }

  await setSeatCookie(data.id, secret, "a")
  redirect(`/r/${secret}`)
}

export async function chooseSeat(secret: string, seat: Seat) {
  return run(async () => {
    const room = await getRoom(secret)
    if (!room) throw new Error("Ruang tidak ditemukan.")
    if (!isSeat(seat)) throw new Error("Pilihan tidak valid.")
    await setSeatCookie(room.id, secret, seat)
    refresh(secret)
    return null
  })
}

export async function leaveSeat(secret: string) {
  return run(async () => {
    const room = await getRoom(secret)
    if (!room) throw new Error("Ruang tidak ditemukan.")
    ;(await cookies()).delete({
      name: seatCookieName(room.id),
      path: `/r/${secret}`,
    })
    refresh(secret)
    return null
  })
}

/* ---------- editions ---------- */

export async function createUploadUrl(secret: string) {
  return run(async () => {
    const { room } = await requireRoomSeat(secret)
    const path = `${room.id}/${randomUUID()}.pdf`
    const { data, error } = await admin()
      .storage.from(PDF_BUCKET)
      .createSignedUploadUrl(path)
    if (error) throw new Error("Gagal menyiapkan upload.")
    return { path: data.path, token: data.token }
  })
}

export async function createEdition(
  secret: string,
  input: { title: string; source: string; path: string; pageCount: number }
) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const title = cleanText(input.title, 160)
    const source = cleanText(input.source, 160) || null
    const pageCount = Math.max(
      1,
      Math.min(2000, Math.floor(Number(input.pageCount) || 1))
    )
    if (!title) throw new Error("Judulnya diisi dulu.")
    if (
      typeof input.path !== "string" ||
      !input.path.startsWith(`${room.id}/`)
    ) {
      throw new Error("File tidak valid.")
    }

    const editions = await getEditions(room.id)
    if (editions.some((e) => !e.archivedAt)) {
      throw new Error("Selesaikan edisi yang sekarang dulu.")
    }
    const number = (editions[0]?.number ?? 0) + 1

    const { error } = await admin().from("editions").insert({
      room_id: room.id,
      number,
      title,
      source,
      pdf_path: input.path,
      page_count: pageCount,
      picked_by: seat,
    })
    if (error) throw new Error("Gagal menyimpan edisi.")
    refresh(secret)
    return { number }
  })
}

/** Adds this week's edition from a link: a PDF, a journal page with a PDF, or a web article. */
export async function importFromUrl(
  secret: string,
  input: { url: string; title?: string }
) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const editions = await getEditions(room.id)
    if (editions.some((e) => !e.archivedAt)) {
      throw new Error("Selesaikan edisi yang sekarang dulu.")
    }
    const number = (editions[0]?.number ?? 0) + 1

    let imported
    try {
      imported = await importUrl(cleanText(input.url, 2000))
    } catch (error) {
      if (error instanceof ImportError) throw error
      console.error("[importFromUrl]", error)
      throw new Error("Gagal mengambil link ini.")
    }

    const typedTitle = cleanText(input.title, 160)
    if (imported.kind === "pdf") {
      const path = `${room.id}/${randomUUID()}.pdf`
      const { error: uploadError } = await admin()
        .storage.from(PDF_BUCKET)
        .upload(path, imported.bytes, { contentType: "application/pdf" })
      if (uploadError) throw new Error("Gagal menyimpan PDF.")
      const fallbackTitle =
        decodeURIComponent(
          new URL(imported.sourceUrl).pathname.split("/").pop() ?? ""
        )
          .replace(/\.pdf$/i, "")
          .replace(/[_-]+/g, " ")
          .trim() || "Jurnal tanpa judul"
      const { error } = await admin()
        .from("editions")
        .insert({
          room_id: room.id,
          number,
          kind: "pdf",
          title: (typedTitle || imported.title || fallbackTitle).slice(0, 160),
          source: imported.site.slice(0, 160),
          source_url: imported.sourceUrl,
          pdf_path: path,
          page_count: 1, // corrected by the reader once the PDF is opened
          picked_by: seat,
        })
      if (error) throw new Error("Gagal menyimpan edisi.")
    } else {
      const { error } = await admin()
        .from("editions")
        .insert({
          room_id: room.id,
          number,
          kind: "article",
          title: (typedTitle || imported.title).slice(0, 160),
          source: [imported.site, imported.byline]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 160),
          source_url: imported.sourceUrl,
          article_html: imported.html,
          article_text: imported.text,
          page_count: 100, // articles track progress as % read
          picked_by: seat,
        })
      if (error) throw new Error("Gagal menyimpan edisi.")
    }
    refresh(secret)
    return { number, kind: imported.kind }
  })
}

/** "Pilihkan jurnal": open-access papers on a topic (typed in any language). */
export async function findPapers(secret: string, topic: string, page = 1) {
  return run(async () => {
    await requireRoomSeat(secret)
    const query = cleanText(topic, 120)
    if (!query) throw new Error("Tulis topiknya dulu.")
    const keywords = await searchKeywords(query)
    try {
      return { keywords, papers: await searchPapers(keywords, page) }
    } catch (error) {
      console.error("[findPapers]", error)
      throw new Error("Pencarian paper lagi bermasalah. Coba lagi sebentar.")
    }
  })
}

/** A PDF fetched from a link starts with page_count 1; the reader fixes it on first open. */
export async function setPageCount(
  secret: string,
  editionId: string,
  pages: number
) {
  return run(async () => {
    const { room } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition || edition.kind !== "pdf") return null
    const n = Math.floor(Number(pages))
    if (!(n >= 1 && n <= 2000) || n === edition.pageCount) return null
    await admin()
      .from("editions")
      .update({ page_count: n })
      .eq("id", edition.id)
    refresh(secret)
    return null
  })
}

/* ---------- reading ---------- */

export async function saveProgress(
  secret: string,
  editionId: string,
  page: number
) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    const safePage = Math.max(
      1,
      Math.min(edition.pageCount, Math.floor(page) || 1)
    )
    const { error } = await admin().from("progress").upsert(
      {
        edition_id: edition.id,
        seat,
        page: safePage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "edition_id,seat" }
    )
    if (error) throw new Error("Gagal menyimpan halaman.")
    return null
  })
}

export async function markDone(secret: string, editionId: string) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    const now = new Date().toISOString()
    const { error } = await admin().from("progress").upsert(
      {
        edition_id: edition.id,
        seat,
        page: edition.pageCount,
        done_at: now,
        updated_at: now,
      },
      { onConflict: "edition_id,seat" }
    )
    if (error) throw new Error("Gagal menyimpan.")
    const progress = await getProgress(edition.id)
    refresh(secret)
    return { bothDone: Boolean(progress.a.doneAt && progress.b.doneAt) }
  })
}

export async function addMark(
  secret: string,
  editionId: string,
  input: {
    page: number
    quote: string
    rects: Rect[]
    range?: { start: number; end: number } | null
    reaction: string
    note?: string
    ai?: { kind: string; answer: string } | null
  }
) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    if (edition.revealedAt)
      throw new Error("Cap sudah dibuka, nggak bisa nambah lagi.")
    if (!isReaction(input.reaction)) throw new Error("Cap tidak valid.")
    const page = Math.floor(Number(input.page))
    if (!(page >= 1 && page <= edition.pageCount))
      throw new Error("Halaman tidak valid.")
    const quote = cleanText(input.quote, 1200)
    if (!quote) throw new Error("Pilih kalimatnya dulu.")

    const { data, error } = await admin()
      .from("marks")
      .insert({
        edition_id: edition.id,
        seat,
        page,
        quote,
        ...parseSpot(edition, input.rects, input.range),
        reaction: input.reaction,
        note: cleanText(input.note, 400) || null,
        ai_kind: input.ai && isAiKind(input.ai.kind) ? input.ai.kind : null,
        ai_answer:
          input.ai && isAiKind(input.ai.kind)
            ? cleanText(input.ai.answer, 4000) || null
            : null,
      })
      .select("id")
      .single<{ id: string }>()
    if (error) throw new Error("Gagal menyimpan cap.")
    refresh(secret)
    return { id: data.id }
  })
}

export async function deleteMark(
  secret: string,
  editionId: string,
  markId: string
) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    if (edition.revealedAt) throw new Error("Cap sudah dibuka.")
    const { error } = await admin()
      .from("marks")
      .delete()
      .eq("id", markId)
      .eq("edition_id", edition.id)
      .eq("seat", seat)
    if (error) throw new Error("Gagal menghapus cap.")
    refresh(secret)
    return null
  })
}

export async function reveal(secret: string, editionId: string) {
  return run(async () => {
    const { room } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    if (edition.revealedAt) return null
    const progress = await getProgress(edition.id)
    if (!progress.a.doneAt || !progress.b.doneAt) {
      throw new Error("Tunggu kalian berdua selesai baca dulu.")
    }
    const { error } = await admin()
      .from("editions")
      .update({ revealed_at: new Date().toISOString() })
      .eq("id", edition.id)
      .is("revealed_at", null)
    if (error) throw new Error("Gagal membuka cap.")
    refresh(secret)
    return null
  })
}

/* ---------- AI notes ---------- */

export async function deleteAiNote(
  secret: string,
  editionId: string,
  noteId: string
) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    const { error } = await admin()
      .from("ai_notes")
      .delete()
      .eq("id", noteId)
      .eq("edition_id", edition.id)
      .eq("seat", seat)
    if (error) throw new Error("Gagal menghapus.")
    refresh(secret)
    return null
  })
}

/* ---------- chat ---------- */

export async function sendMessage(
  secret: string,
  editionId: string,
  body: string,
  page: number | null
) {
  return run(async (): Promise<ChatMessage> => {
    const { room, seat } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    const text = cleanText(body, 1000)
    if (!text) throw new Error("Pesannya kosong.")
    const safePage =
      page && page >= 1 && page <= edition.pageCount ? Math.floor(page) : null
    const { data, error } = await admin()
      .from("messages")
      .insert({ edition_id: edition.id, seat, body: text, page: safePage })
      .select("id, created_at")
      .single<{ id: string; created_at: string }>()
    if (error) throw new Error("Pesan gagal terkirim.")
    return {
      id: data.id,
      seat,
      body: text,
      page: safePage,
      createdAt: data.created_at,
    }
  })
}

/* ---------- talk time ---------- */

export async function advanceTalk(
  secret: string,
  editionId: string,
  expectedIndex: number
) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    if (!edition.revealedAt) throw new Error("Cap belum dibuka.")
    if (edition.talkDoneAt) return { done: true }
    if (edition.talkIndex !== expectedIndex) return { done: false } // someone already moved on

    const { marks } = await getMarks(edition, seat)
    const deck = buildDeck(marks, edition.pickedBy)
    const card = deck[edition.talkIndex]
    // a shared "Sama!" card can be moved on by either of you
    if (card && !card.twin && card.mark.seat !== seat) {
      throw new Error(
        `Ini kartu ${room.names[card.mark.seat]}, cuma dia yang bisa lanjut.`
      )
    }

    const isLast = edition.talkIndex >= deck.length - 1
    const { error } = await admin()
      .from("editions")
      .update(
        isLast
          ? { talk_done_at: new Date().toISOString() }
          : { talk_index: edition.talkIndex + 1 }
      )
      .eq("id", edition.id)
      .eq("talk_index", edition.talkIndex)
    if (error) throw new Error("Gagal lanjut.")
    refresh(secret)
    return { done: isLast }
  })
}

export async function saveLearning(
  secret: string,
  editionId: string,
  body: string
) {
  return run(async () => {
    const { room, seat } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    const text = cleanText(body, 280)
    if (!text) throw new Error("Tulis satu kalimat dulu.")
    const { error } = await admin().from("learnings").upsert(
      {
        edition_id: edition.id,
        seat,
        body: text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "edition_id,seat" }
    )
    if (error) throw new Error("Gagal menyimpan.")
    refresh(secret)
    return null
  })
}

export async function archiveEdition(secret: string, editionId: string) {
  return run(async () => {
    const { room } = await requireRoomSeat(secret)
    const edition = await getEditionById(room.id, editionId)
    if (!edition) throw new Error("Edisi tidak ditemukan.")
    if (!edition.revealedAt) throw new Error("Cap belum dibuka.")
    if (edition.archivedAt) return null
    const { error } = await admin()
      .from("editions")
      .update({
        archived_at: new Date().toISOString(),
        talk_done_at: edition.talkDoneAt ?? new Date().toISOString(),
      })
      .eq("id", edition.id)
    if (error) throw new Error("Gagal menyimpan ke arsip.")
    refresh(secret)
    return null
  })
}
