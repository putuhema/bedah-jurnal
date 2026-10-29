import { ImageResponse } from "next/og"

const BLUE = "#1348dc"

/**
 * The app icon: the logo mark in white on the primary blue.
 * `inset` is how much of the tile the mark takes (smaller for maskable icons,
 * which Android may crop to a circle).
 */
export function appIcon(size: number, inset = 0.5) {
  const mark = Math.round(size * inset)
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BLUE,
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 20 20" fill="none">
        <rect
          x="1"
          y="1"
          width="18"
          height="18"
          rx="1.6"
          stroke="white"
          strokeWidth="1.5"
        />
        <path
          d="M10 4.5 15.5 10 10 15.5 4.5 10Z"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>,
    { width: size, height: size }
  )
}
