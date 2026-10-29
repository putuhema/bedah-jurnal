import { CreateRoomForm } from "@/components/bedah/create-room-form"

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-10 px-6 py-12">
      <span className="flex items-center gap-2 text-[15px] font-medium text-foreground">
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="1"
            y="1"
            width="18"
            height="18"
            rx="2"
            className="stroke-primary"
            strokeWidth="1.4"
          />
          <path
            d="M10 4.5 15.5 10 10 15.5 4.5 10Z"
            className="stroke-primary"
            strokeWidth="1.4"
          />
        </svg>
        Bedah Jurnal
      </span>

      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-[44px] leading-[1.05] font-light tracking-tight text-primary italic">
          Baca pelan, ngobrol lama
        </h1>
        <p>
          Satu jurnal seminggu, berdua dari jauh. Cap kalimat, buka bareng, lalu
          ngobrol.
        </p>
      </div>

      <div className="pt-8 rail">
        <CreateRoomForm needsCode={Boolean(process.env.ROOM_CREATE_CODE)} />
      </div>

      <p className="text-xs text-muted-foreground">
        Setelah dibuat, kamu dapat link rahasia. Kirim link itu cuma ke dia:
        siapa pun yang punya link bisa masuk.
      </p>
    </main>
  )
}
