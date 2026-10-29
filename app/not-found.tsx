import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <p className="text-xs text-muted-foreground">404</p>
      <h1 className="font-serif text-4xl font-light text-primary italic">
        Ruangnya nggak ketemu
      </h1>
      <p>Cek lagi link-nya. Link ruang itu panjang dan harus lengkap.</p>
      <Button
        variant="outline"
        render={<Link href="/" />}
        nativeButton={false}
        className="self-start"
      >
        Ke halaman awal
      </Button>
    </main>
  )
}
