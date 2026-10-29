import type { Seat } from "@/lib/types"

/** Colour classes per seat: a = blue, b = violet. Safe to import from server and client. */
export const seatText: Record<Seat, string> = {
  a: "text-reader-a",
  b: "text-reader-b",
}
export const seatBg: Record<Seat, string> = {
  a: "bg-reader-a",
  b: "bg-reader-b",
}
export const seatBorder: Record<Seat, string> = {
  a: "border-reader-a",
  b: "border-reader-b",
}
export const seatHighlight: Record<Seat, string> = {
  a: "bg-highlight-a border-reader-a",
  b: "bg-highlight-b border-reader-b",
}

/** Side-specific border colours (a plain border colour would override the other side). */
export const seatBorderLeft: Record<Seat, string> = {
  a: "border-l-reader-a",
  b: "border-l-reader-b",
}
export const seatBorderRight: Record<Seat, string> = {
  a: "border-r-reader-a",
  b: "border-r-reader-b",
}
