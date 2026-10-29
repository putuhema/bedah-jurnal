import type { MetadataRoute } from "next"

export function webManifest(
  startUrl: string,
  id = startUrl
): MetadataRoute.Manifest {
  return {
    id,
    name: "Bedah Jurnal",
    short_name: "Bedah Jurnal",
    description: "Satu jurnal seminggu, berdua dari jauh.",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f4f2",
    theme_color: "#f4f4f2",
    lang: "id",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/pwa/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
