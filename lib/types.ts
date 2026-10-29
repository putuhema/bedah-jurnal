/** Each room has two seats. "a" is shown in blue, "b" in violet. */
export type Seat = "a" | "b"

export const SEATS: Seat[] = ["a", "b"]

export function otherSeat(seat: Seat): Seat {
  return seat === "a" ? "b" : "a"
}

export function isSeat(value: unknown): value is Seat {
  return value === "a" || value === "b"
}

export const REACTIONS = ["wah", "hmm", "wkwk", "hah", "ide"] as const
export type Reaction = (typeof REACTIONS)[number]

export const REACTION_LABEL: Record<Reaction, string> = {
  wah: "wah!",
  hmm: "hmm",
  wkwk: "wkwk",
  hah: "hah?",
  ide: "ide!",
}

export function isReaction(value: unknown): value is Reaction {
  return (
    typeof value === "string" &&
    (REACTIONS as readonly string[]).includes(value)
  )
}

/** "Tanya AI": the three kinds of question you can ask about a sentence. */
export const AI_KINDS = ["simpel", "istilah", "klaim"] as const
export type AiKind = (typeof AI_KINDS)[number]

export const AI_KIND_LABEL: Record<AiKind, string> = {
  simpel: "jelasin simpel",
  istilah: "artinya apa?",
  klaim: "klaim kuat nggak?",
}

export function isAiKind(value: unknown): value is AiKind {
  return (
    typeof value === "string" && (AI_KINDS as readonly string[]).includes(value)
  )
}

/** Where an article stamp sits: character offsets in the article's text. */
export type TextRange = { start: number; end: number }

/** A highlight rectangle, as a fraction (0..1) of the page width and height. */
export type Rect = { x: number; y: number; w: number; h: number }

export type Room = {
  id: string
  secret: string
  names: Record<Seat, string>
}

export type Edition = {
  id: string
  number: number
  /** "pdf": a PDF page by page. "article": a web article, read as one long page. */
  kind: "pdf" | "article"
  title: string
  source: string | null
  /** the original link, when it was imported from one */
  sourceUrl: string | null
  pdfPath: string | null
  /** PDF: number of pages. Article: 100, so "page" is the % read. */
  pageCount: number
  pickedBy: Seat
  revealedAt: string | null
  talkIndex: number
  talkDoneAt: string | null
  archivedAt: string | null
  createdAt: string
}

export type Progress = {
  seat: Seat
  page: number
  doneAt: string | null
}

export type Mark = {
  id: string
  seat: Seat
  page: number
  quote: string
  rects: Rect[]
  /** set for article stamps (rects is empty then) */
  range: TextRange | null
  reaction: Reaction
  note: string | null
  /** Answer from "Tanya AI", if the stamper asked before stamping. */
  ai: { kind: AiKind; answer: string } | null
  createdAt: string
}

/** A saved "Tanya AI" answer about a sentence (with or without a stamp). */
export type AiNote = {
  id: string
  seat: Seat
  page: number
  quote: string
  rects: Rect[]
  range: TextRange | null
  kind: AiKind
  answer: string
  createdAt: string
}

/** One entry in "Kamus kita": a puzzling sentence or term, and what it means. */
export type KamusEntry = {
  id: string
  editionNumber: number
  editionTitle: string
  editionKind: "pdf" | "article"
  page: number
  quote: string
  /** the AI's explanation, if someone asked */
  meaning: string | null
  /** stamp notes on it, by seat */
  notes: { seat: Seat; text: string }[]
  /** who added it: stamped [hah?] or asked "artinya apa?" */
  seats: Seat[]
  createdAt: string
}

export type Learning = {
  seat: Seat
  body: string
}

export type ChatMessage = {
  id: string
  seat: Seat
  body: string
  /** The page the sender was on, so the other person can jump there. */
  page: number | null
  createdAt: string
}

/**
 * One card in talk time. Only its owner can move to the next card,
 * except a "twin" card (you both stamped the same sentence): either of you can.
 */
export type TalkCard = {
  mark: Mark
  prompt: string
  twin?: Mark
}
