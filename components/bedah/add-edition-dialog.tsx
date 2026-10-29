"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ExternalLinkIcon,
  FileUpIcon,
  SearchIcon,
  ShuffleIcon,
} from "lucide-react"

import {
  createEdition,
  createUploadUrl,
  findPapers,
  importFromUrl,
} from "@/app/actions"
import { useRoom } from "@/components/bedah/room-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useHotkey } from "@/hooks/use-hotkey"
import { PDF_MAX_BYTES } from "@/lib/limits"
import { countPages } from "@/lib/pdf"
import { browserClient } from "@/lib/supabase/browser"

type Paper = {
  id: string
  title: string
  year: number | null
  venue: string | null
  abstract: string | null
  citedBy: number
  url: string
  kind: "pdf" | "article"
}

const TOPIC_IDEAS = [
  "musik",
  "tidur",
  "kucing",
  "kopi",
  "cinta",
  "mimpi",
  "luar angkasa",
  "makanan",
]

function titleFromFile(name: string) {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .trim()
}

/** Add this week's edition: upload a PDF, paste a link (PDF or article), or let it pick a paper. */
export function AddEditionDialog({
  nextNumber,
  trigger,
}: {
  nextNumber: number
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const { secret, notifyChanged } = useRoom()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  useHotkey("n", () => setOpen(true))

  function created(number: number) {
    notifyChanged()
    setOpen(false)
    router.push(`/r/${secret}/e/${number}`)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button>
              <FileUpIcon data-icon="inline-start" />
              Tambah jurnal <Kbd>N</Kbd>
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <p className="text-xs text-muted-foreground">edisi No.{nextNumber}</p>
          <DialogTitle>Bacaan minggu ini</DialogTitle>
          <DialogDescription>
            Jurnal, paper, atau artikel apa saja yang seru.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="pick" className="min-w-0 gap-4">
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="pick">Pilihkan</TabsTrigger>
            <TabsTrigger value="link">Tempel link</TabsTrigger>
            <TabsTrigger value="upload">Upload PDF</TabsTrigger>
          </TabsList>
          <TabsContent value="pick">
            <PickPaper onBusy={setBusy} onCreated={created} />
          </TabsContent>
          <TabsContent value="link">
            <PasteLink onBusy={setBusy} onCreated={created} />
          </TabsContent>
          <TabsContent value="upload">
            <UploadPdf onBusy={setBusy} onCreated={created} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

type StepProps = {
  onBusy: (busy: boolean) => void
  onCreated: (number: number) => void
}

/* ---------- Pilihkan: open-access papers on a topic ---------- */

function PickPaper({ onBusy, onCreated }: StepProps) {
  const { secret } = useRoom()
  const [topic, setTopic] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [papers, setPapers] = React.useState<Paper[] | null>(null)
  const [keywords, setKeywords] = React.useState<string | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [picking, setPicking] = React.useState<string | null>(null)
  const [error, setError] = React.useState<{
    id: string | null
    message: string
  } | null>(null)

  async function search(query: string, nextPage = 1) {
    if (!query.trim()) return
    setTopic(query)
    setPage(nextPage)
    setSearching(true)
    setError(null)
    const result = await findPapers(secret, query, nextPage)
    setSearching(false)
    if (!result.ok) return setError({ id: null, message: result.error })
    setKeywords(result.data.keywords)
    setPapers(result.data.papers)
  }

  async function pick(paper: Paper) {
    setPicking(paper.id)
    setError(null)
    onBusy(true)
    const result = await importFromUrl(secret, {
      url: paper.url,
      title: paper.title,
    })
    onBusy(false)
    setPicking(null)
    if (!result.ok) return setError({ id: paper.id, message: result.error })
    onCreated(result.data.number)
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void search(topic)
        }}
      >
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topik apa? mis. tidur, kucing, musik…"
          aria-label="Topik"
          maxLength={120}
        />
        <Button type="submit" disabled={searching || !topic.trim()}>
          {searching ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SearchIcon data-icon="inline-start" />
          )}
          Cari
        </Button>
      </form>

      {!papers && (
        <div className="flex flex-wrap gap-1.5">
          {TOPIC_IDEAS.map((idea) => (
            <Button
              key={idea}
              variant="outline"
              size="xs"
              onClick={() => search(idea)}
              disabled={searching}
            >
              {idea}
            </Button>
          ))}
        </div>
      )}

      {error?.id === null && <FieldError>{error.message}</FieldError>}

      {papers && (
        <>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">
              {papers.length
                ? `open access · dicari: ${keywords}`
                : `Nggak ada hasil untuk "${keywords}".`}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => search(topic, page + 1)}
              disabled={searching}
            >
              <ShuffleIcon data-icon="inline-start" />
              Acak lagi
            </Button>
          </div>
          <ul className="flex flex-col gap-2" data-slot="paper-results">
            {papers.map((paper) => (
              <li
                key={paper.id}
                className="flex flex-col gap-1.5 rounded-lg p-3 ring-1 ring-border"
              >
                <p className="font-serif text-[15px] leading-snug text-foreground">
                  {paper.title}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {[paper.year, paper.venue].filter(Boolean).join(" · ")}
                  {paper.citedBy > 0 && <span>· dikutip {paper.citedBy}×</span>}
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    {paper.kind === "pdf" ? "PDF" : "artikel"}
                  </Badge>
                </p>
                {paper.abstract && (
                  <p className="line-clamp-4 text-xs leading-relaxed">
                    {paper.abstract}
                  </p>
                )}
                {error?.id === paper.id && (
                  <FieldError>
                    {error.message}{" "}
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Buka sumbernya
                    </a>
                  </FieldError>
                )}
                <div className="flex justify-end gap-1.5 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    render={
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    <ExternalLinkIcon data-icon="inline-start" />
                    Lihat
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => pick(paper)}
                    disabled={picking !== null}
                  >
                    {picking === paper.id && (
                      <Spinner data-icon="inline-start" />
                    )}
                    {picking === paper.id ? "Mengambil…" : "Pilih ini"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/* ---------- Tempel link: a PDF, a journal page, or a web article ---------- */

function PasteLink({ onBusy, onCreated }: StepProps) {
  const { secret } = useRoom()
  const [url, setUrl] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim()) return setError("Tempel link-nya dulu.")
    setError(null)
    setBusy(true)
    onBusy(true)
    const result = await importFromUrl(secret, { url, title })
    setBusy(false)
    onBusy(false)
    if (!result.ok) return setError(result.error)
    onCreated(result.data.number)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldGroup>
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="link">Link</FieldLabel>
          <Input
            id="link"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            disabled={busy}
            aria-invalid={Boolean(error) || undefined}
          />
          <FieldDescription>
            PDF, halaman jurnal, atau artikel web. Kami simpan salinannya, jadi
            tetap bisa dibaca walau link-nya berubah.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="link-title">Judul (opsional)</FieldLabel>
          <Input
            id="link-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Diambil dari halamannya kalau kosong"
            maxLength={160}
            disabled={busy}
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <Button type="submit" disabled={busy} className="self-end">
        {busy && <Spinner data-icon="inline-start" />}
        {busy ? "Mengambil…" : "Mulai edisi"}
      </Button>
    </form>
  )
}

/* ---------- Upload PDF ---------- */

function UploadPdf({ onBusy, onCreated }: StepProps) {
  const { secret } = useRoom()
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState("")
  const [source, setSource] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [step, setStep] = React.useState<string | null>(null)

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null
    setError(null)
    if (next && next.type !== "application/pdf")
      return setError("Harus file PDF.")
    if (next && next.size > PDF_MAX_BYTES) return setError("Maksimal 50 MB.")
    setFile(next)
    if (next && !title) setTitle(titleFromFile(next.name))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return setError("Pilih PDF-nya dulu.")
    if (!title.trim()) return setError("Judulnya diisi dulu.")
    setError(null)
    onBusy(true)
    try {
      setStep("Menghitung halaman…")
      const pageCount = await countPages(file)

      setStep("Mengunggah…")
      const upload = await createUploadUrl(secret)
      if (!upload.ok) throw new Error(upload.error)
      const { error: uploadError } = await browserClient()
        .storage.from("journals")
        .uploadToSignedUrl(upload.data.path, upload.data.token, file, {
          contentType: "application/pdf",
        })
      if (uploadError) throw new Error("Upload gagal. Coba lagi.")

      setStep("Menyimpan…")
      const created = await createEdition(secret, {
        title,
        source,
        path: upload.data.path,
        pageCount,
      })
      if (!created.ok) throw new Error(created.error)
      onCreated(created.data.number)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ada yang salah.")
    } finally {
      setStep(null)
      onBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldGroup>
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="pdf">File PDF</FieldLabel>
          <Input
            id="pdf"
            type="file"
            accept="application/pdf"
            onChange={onFile}
            disabled={Boolean(step)}
          />
          <FieldDescription>Maksimal 50 MB.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="title">Judul</FieldLabel>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kenapa kita merinding dengar musik?"
            maxLength={160}
            disabled={Boolean(step)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="source">Sumber (opsional)</FieldLabel>
          <Input
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Frontiers in Psychology, 2016"
            maxLength={160}
            disabled={Boolean(step)}
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <Button type="submit" disabled={Boolean(step)} className="self-end">
        {step ? <Spinner data-icon="inline-start" /> : null}
        {step ?? "Mulai edisi"}
      </Button>
    </form>
  )
}
