import { webManifest } from "@/lib/manifest"

/**
 * Installing from inside a room opens that room, not the landing page.
 * (On iPhone the installed app has its own storage, so it asks "Kamu siapa?" once.)
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/r/[secret]/manifest.webmanifest">
) {
  const { secret } = await params
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(secret)) {
    return new Response("Not found", { status: 404 })
  }
  return Response.json(webManifest(`/r/${secret}`), {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "private, max-age=86400",
    },
  })
}
