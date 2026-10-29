"use client"

type PdfJs = typeof import("pdfjs-dist")

let loading: Promise<PdfJs> | undefined

/** Loads pdf.js only in the browser. The worker is copied to /public by scripts/copy-pdf-worker.mjs. */
export function loadPdfjs(): Promise<PdfJs> {
  loading ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
    return pdfjs
  })
  return loading
}

export async function countPages(file: File): Promise<number> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  })
  try {
    return (await task.promise).numPages
  } finally {
    await task.destroy()
  }
}
