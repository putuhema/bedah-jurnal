import {
  otherSeat,
  type Mark,
  type Reaction,
  type Seat,
  type TalkCard,
} from "@/lib/types"
import { findTwins } from "@/lib/overlap"

const PROMPTS: Record<Reaction, string> = {
  wah: "Apa yang bikin kamu kaget di sini?",
  hmm: "Kamu kepikiran apa waktu baca ini?",
  wkwk: "Ceritain kenapa ini lucu buat kamu.",
  hah: "Tebak dulu artinya bareng, baru cari jawabannya.",
  ide: "Idenya apa? Ceritain.",
}

function readingOrder(a: Mark, b: Mark) {
  if (a.page !== b.page) return a.page - b.page
  const ay = a.rects[0]?.y ?? 0
  const by = b.rects[0]?.y ?? 0
  return ay - by
}

/**
 * Builds the talk-time deck: marks in reading order, alternating between seats
 * so you take turns. The person who did NOT pick the journal goes first.
 */
export const TWIN_PROMPT =
  "Kalian berdua cap kalimat yang sama. Kenapa kalimat ini nempel di kepala kalian?"

export function buildDeck(marks: Mark[], pickedBy: Seat): TalkCard[] {
  // "Sama!" first: sentences you both stamped become one shared card
  const twins = findTwins(marks)
  const paired = new Set(twins.flatMap(([a, b]) => [a.id, b.id]))
  const deck: TalkCard[] = twins.map(([a, b]) => {
    const [first, second] = pickedBy === "a" ? [b, a] : [a, b]
    return { mark: first, twin: second, prompt: TWIN_PROMPT }
  })

  const rest = marks.filter((m) => !paired.has(m.id))
  const queues: Record<Seat, Mark[]> = {
    a: rest.filter((m) => m.seat === "a").sort(readingOrder),
    b: rest.filter((m) => m.seat === "b").sort(readingOrder),
  }

  let turn = otherSeat(pickedBy)
  while (queues.a.length || queues.b.length) {
    const next = queues[turn].shift() ?? queues[otherSeat(turn)].shift()
    if (next) deck.push({ mark: next, prompt: PROMPTS[next.reaction] })
    turn = otherSeat(turn)
  }
  return deck
}
