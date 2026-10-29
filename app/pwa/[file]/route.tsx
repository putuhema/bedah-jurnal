import { appIcon } from "@/lib/app-icon"

/** Home-screen icons for the web app manifest, built once at deploy. */
const ICONS: Record<string, () => Response> = {
  "icon-192.png": () => appIcon(192),
  "icon-512.png": () => appIcon(512),
  // Android crops maskable icons to a circle, so the mark sits further in
  "maskable-512.png": () => appIcon(512, 0.4),
}

export const dynamicParams = false

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }))
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/pwa/[file]">
) {
  const { file } = await params
  const make = ICONS[file]
  if (!make) return new Response("Not found", { status: 404 })
  return make()
}
