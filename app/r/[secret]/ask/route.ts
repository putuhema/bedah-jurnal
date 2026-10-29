import {
  AI_DAILY_LIMIT,
  KIND_INSTRUCTION,
  aiEnabled,
  aiErrorMessage,
  streamAnswer,
} from "@/lib/ai"
import { getEditionById, requireRoomSeat } from "@/lib/room"
import { admin } from "@/lib/supabase/admin"
import { isAiKind } from "@/lib/types"
import { parseSpot } from "@/lib/validate"

/**
 * "Tanya AI" about a selected sentence. Streams the answer as plain text.
 * Lives under /r/[secret] so the seat cookie (scoped to that path) is sent along.
 * Body: { editionId, kind, quote, context }
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/r/[secret]/ask">
) {
  const { secret } = await params
  if (!aiEnabled()) {
    return text(
      "AI belum disetel di server ini. Isi LLM_PROVIDER, LLM_BASE_URL, LLM_API_KEY, dan LLM_MODEL di .env.local.",
      503
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return text("Permintaan tidak valid.", 400)
  }

  const { editionId, kind } = body
  const page = Math.floor(Number(body.page))
  const quote =
    typeof body.quote === "string" ? body.quote.trim().slice(0, 1500) : ""
  // the page text around the sentence; capped so one question stays cheap
  const context =
    typeof body.context === "string" ? body.context.slice(0, 12000) : ""
  if (
    typeof secret !== "string" ||
    typeof editionId !== "string" ||
    !isAiKind(kind) ||
    !quote
  ) {
    return text("Permintaan tidak valid.", 400)
  }

  let room, seat
  try {
    ;({ room, seat } = await requireRoomSeat(secret))
  } catch {
    return text("Tidak diizinkan.", 403)
  }
  const edition = await getEditionById(room.id, editionId)
  if (!edition) return text("Edisi tidak ditemukan.", 404)
  if (!(page >= 1 && page <= edition.pageCount)) {
    return text("Halaman tidak valid.", 400)
  }
  let spot
  try {
    spot = parseSpot(edition, body.rects, body.range)
  } catch {
    return text("Pilihan teks tidak valid.", 400)
  }

  // daily limit per room
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin()
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)
    .gte("created_at", since)
  if ((count ?? 0) >= AI_DAILY_LIMIT) {
    return text(
      `Jatah tanya AI hari ini sudah habis (${AI_DAILY_LIMIT}/hari). Coba lagi besok.`,
      429
    )
  }
  await admin().from("ai_requests").insert({ room_id: room.id, seat })

  const userContent = [
    `Jurnal: "${edition.title}"${edition.source ? ` (${edition.source})` : ""}`,
    "",
    "Teks di sekitar kalimat (dari PDF, bisa berantakan):",
    "<teks>",
    context || "(tidak tersedia)",
    "</teks>",
    "",
    "Kalimat yang ditandai:",
    `<kalimat>${quote}</kalimat>`,
    "",
    KIND_INSTRUCTION[kind],
  ].join("\n")

  const abort = new AbortController()
  const encoder = new TextEncoder()
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let answer = ""
        for await (const chunk of streamAnswer(userContent, abort.signal)) {
          answer += chunk
          controller.enqueue(encoder.encode(chunk))
        }
        // keep it like a note, so closing the card or reloading doesn't lose it
        if (answer.trim()) {
          const { error } = await admin()
            .from("ai_notes")
            .insert({
              edition_id: edition.id,
              seat,
              page,
              quote,
              ...spot,
              kind,
              answer: answer.trim().slice(0, 4000),
            })
          if (error) console.error("[ask] saving note", error)
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error("[ask]", error)
          controller.enqueue(encoder.encode(`\n\n(${aiErrorMessage(error)})`))
        }
      } finally {
        controller.close()
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(body$, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  })
}

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
