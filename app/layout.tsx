import type { Metadata, Viewport } from "next"
import { IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google"

import "./globals.css"
import { Toaster } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
})

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  variable: "--font-plex-serif",
})

export const metadata: Metadata = {
  title: "Bedah Jurnal",
  description: "Satu jurnal seminggu, berdua dari jauh.",
  applicationName: "Bedah Jurnal",
  appleWebApp: {
    capable: true,
    title: "Bedah Jurnal",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: "#f4f4f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className={cn(plexMono.variable, plexSerif.variable)}>
      <body>
        <Toaster>{children}</Toaster>
      </body>
    </html>
  )
}
