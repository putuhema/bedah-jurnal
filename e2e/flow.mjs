// End-to-end: two phones (Putu = seat a, S = seat b) go through one full edition.
// Run with the dev server up:  BASE_URL=http://localhost:3000 node e2e/flow.mjs
// Uses the installed Google Chrome through playwright-core (no browser download).
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
// set AI_E2E=1 when the app runs against e2e/mock-ai.mjs (see README)
const AI = process.env.AI_E2E === "1"
const MOCK = process.env.MOCK_URL ?? "http://localhost:4010"
const here = fileURLToPath(new URL(".", import.meta.url))
const shots = `${here}screens`
mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ channel: "chrome", headless: true })
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false }
const ctxA = await browser.newContext(phone)
const ctxB = await browser.newContext(phone)
const a = await ctxA.newPage()
const b = await ctxB.newPage()
for (const [name, p] of [["A", a], ["B", b]]) {
  p.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message))
  p.on("console", (m) => {
    if (!["error", "warning"].includes(m.type())) return
    const text = m.text()
    // for hydration mismatches, print the diff lines and the url
    const detail = text.includes("hydrated")
      ? `${p.url()}\n` + text.split("\n").filter((l) => /^\s*[+-]\s/.test(l)).join("\n")
      : text.slice(0, 400)
    console.log(`[${name} ${m.type()}]`, detail)
  })
}

let step = 0
async function shot(p, name) {
  step++
  await p.screenshot({ path: `${shots}/${String(step).padStart(2, "0")}-${name}.png`, caret: "initial" })
}
function check(cond, label) {
  if (!cond) throw new Error(`FAILED: ${label}`)
  console.log(`  ✓ ${label}`)
}

/** Select the given text inside the pdf.js text layer of a page, like a long-press would. */
async function selectText(p, pageNo, text) {
  await p.waitForSelector(`[data-page="${pageNo}"] .textLayer span`, { timeout: 20000 })
  const found = await p.evaluate(
    ({ pageNo, text }) => {
      const layer = document.querySelector(`[data-page="${pageNo}"] .textLayer`)
      const span = [...layer.querySelectorAll("span")].find((s) => s.textContent.includes(text))
      if (!span) return false
      const node = span.firstChild
      const start = node.textContent.indexOf(text)
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + text.length)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      return true
    },
    { pageNo, text }
  )
  if (!found) throw new Error(`text not found on page ${pageNo}: ${text}`)
  await p.getByText("cap kalimat ini").waitFor({ timeout: 5000 })
}

/** Select from one text to another (can span several lines) on a page. */
async function selectAcross(p, pageNo, fromText, toText) {
  await p.evaluate(
    ({ pageNo, fromText, toText }) => {
      const spans = [...document.querySelectorAll(`[data-page="${pageNo}"] .textLayer span`)]
      const a = spans.find((s) => s.textContent.includes(fromText))
      const z = spans.find((s) => s.textContent.includes(toText))
      const range = document.createRange()
      range.setStart(a.firstChild, a.textContent.indexOf(fromText))
      range.setEnd(z.firstChild, z.textContent.indexOf(toText) + toText.length)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    },
    { pageNo, fromText, toText }
  )
  await p.getByText("cap kalimat ini").waitFor({ timeout: 5000 })
}

/** Distance (px) from the bottom of the selected text to the top of the stamp card. */
async function cardGap(p) {
  return p.evaluate(() => {
    const rects = [...window.getSelection().getRangeAt(0).getClientRects()].filter((r) => r.height < 80)
    const bottom = Math.max(...rects.map((r) => r.bottom))
    const card = document.querySelector("[data-slot=stamp-card]")
    return card.getBoundingClientRect().top - bottom
  })
}

try {
  console.log("1. Putu creates the room")
  await a.goto(BASE)
  await shot(a, "landing")
  await a.getByLabel("Nama kamu").fill("Putu")
  await a.getByLabel("Nama dia").fill("S")
  await a.getByRole("button", { name: "Bikin ruang baca" }).click()
  await a.waitForURL(/\/r\/[A-Za-z0-9_-]+$/)
  const roomUrl = a.url()
  await a.getByText("Rak masih kosong").waitFor()
  check(true, "room created, empty shelf shown")
  await shot(a, "shelf-empty")

  console.log("2. Putu adds this week's journal")
  await a.getByRole("button", { name: /Tambah jurnal/ }).click()
  await a.getByRole("tab", { name: "Upload PDF" }).click()
  await a.locator("#pdf").setInputFiles(`${here}sample.pdf`)
  check((await a.locator("#title").inputValue()) === "sample", "title filled from file name")
  await a.locator("#title").fill("Kenapa kita merinding dengar musik?")
  await a.locator("#source").fill("Frontiers in Psychology, 2016")
  await shot(a, "add-dialog")
  await a.getByRole("button", { name: "Mulai edisi" }).click()
  await a.waitForURL(/\/e\/1$/, { timeout: 30000 })
  await a.waitForSelector('[data-page="1"] .textLayer span', { timeout: 20000 })
  check(true, "edition 1 created, PDF rendered with a text layer")
  await shot(a, "reader-a")

  console.log("3. S opens the link and picks a seat")
  await b.goto(roomUrl)
  await b.getByText("Kamu siapa?").waitFor()
  await shot(b, "seat-picker")
  await b.getByRole("button", { name: /^S/ }).click()
  await b.getByText("edisi minggu ini").waitFor()
  await shot(b, "shelf-b")

  console.log("4. Putu stamps a sentence" + (AI ? ", after asking AI" : ""))
  await selectText(a, 1, "two-thirds of people report experiencing chills")
  if (AI) {
    await a.getByRole("button", { name: "jelasin simpel" }).click()
    const answer = a.locator("[data-slot=ai-answer]")
    await answer.getByText("Kira-kira 2 dari 3 orang").waitFor({ timeout: 15000 })
    await a.getByText("Jawaban AI terbaru ikut tersimpan di cap ini.").waitFor()
    check(true, "AI answer streams into the stamp card")
    const sent = await (await fetch(`${MOCK}/last-request`)).json()
    let userText
    if (sent.path?.startsWith("/v1/chat/completions")) {
      // OpenAI-compatible provider
      const expected = process.env.LLM_MODEL ?? "mock-model"
      check(sent.body.model === expected, `OpenAI-compatible request uses model ${expected}`)
      check(sent.body.stream === true, "request streams")
      check(sent.headers.authorization === "Bearer test-key", "API key is sent as a bearer token")
      check(typeof sent.body.max_tokens === "number", "answer length is capped")
      check(sent.body.messages[0].role === "system", "system prompt comes first")
      userText = sent.body.messages[1].content
    } else {
      // Claude
      check(sent.body.model === "claude-opus-5-5", `request uses claude-opus-5-5 (${sent.body.model})`)
      check(sent.body.fallbacks === "default", "request opts into server-side fallbacks")
      check(sent.body.output_config?.effort === "low", "request uses low effort")
      check(sent.body.system?.[0]?.cache_control?.type === "ephemeral", "system prompt is marked for caching")
      userText = sent.body.messages[0].content
    }
    check(userText.includes("<kalimat>two-thirds of people report experiencing chills</kalimat>"), "the selected sentence is sent")
    check(userText.includes("a phenomenon known as frisson"), "the surrounding page text is sent as context")
    await shot(a, "ai-answer")
  } else {
    // AI may or may not be configured on this server; the AI path is covered by AI_E2E=1 / live-ai.mjs
    console.log(`  · AI buttons ${(await a.getByText("tanya AI:").count()) ? "shown (provider configured)" : "hidden (no provider)"}`)
  }
  await shot(a, "stamp-picker")
  await a.getByRole("button", { name: "[wah!]" }).click()
  await a.getByText("Dicap [wah!]").waitFor()
  await a.locator('[data-page="1"] button', { hasText: "[wah!]" }).waitFor()
  check(true, "mark saved and shown on Putu's page")
  if (AI) {
    await a.locator('[data-page="1"] button', { hasText: "[wah!]" }).click()
    await a.locator("[data-slot=stamp-card] [data-slot=ai-answer]").getByText("Kira-kira 2 dari 3 orang").waitFor()
    check(true, "the AI answer is saved on the stamp")
    await a.getByRole("button", { name: "Tutup" }).click()

    // asking without stamping keeps the answer, like a note
    await selectText(a, 3, "openness to experience")
    await a.getByRole("button", { name: "artinya apa?" }).click()
    await a.locator("[data-slot=ai-answer]").getByText("Kira-kira 2 dari 3 orang").first().waitFor({ timeout: 15000 })
    await a.waitForTimeout(800) // let the saved copy load
    await a.getByRole("button", { name: "Batal" }).click()
    await a.evaluate(() => getSelection().removeAllRanges())
    await a.locator('[data-page="3"] [data-slot=ai-tag]').waitFor({ timeout: 10000 })
    check(true, "an AI answer without a stamp leaves a ✦ AI tag on the page")
    await a.reload()
    await a.locator('[data-page="3"] [data-slot=ai-tag]').click({ timeout: 20000 })
    await a.locator("[data-slot=stamp-card]").getByText("Kira-kira 2 dari 3 orang").waitFor()
    check(true, "the answer is still there after a reload")
    await a.waitForTimeout(1500) // the PDF finishes loading meanwhile; the card must stay put
    await a.waitForFunction(() => {
      const card = document.querySelector("[data-slot=stamp-card]")?.getBoundingClientRect()
      const area = document.querySelector("[data-slot=reader-scroll]").getBoundingClientRect()
      return card && card.top >= area.top - 1 && card.bottom <= area.bottom + 1
    }, null, { timeout: 5000 })
    check(true, "the saved answer opens fully in view")
    await shot(a, "ai-note-saved")
    await a.getByRole("button", { name: "Tutup" }).click()
    await a.evaluate(() => document.querySelector('[data-page="1"]').scrollIntoView({ block: "start" }))
  }

  await selectAcross(a, 1, "Those who experience", "more efficiently")
  await a.waitForTimeout(300)
  const gap = await cardGap(a)
  check(gap >= 0 && gap < 30, `stamp card sits right under a two-line selection (gap ${Math.round(gap)}px)`)
  await a.mouse.move(195, 420) // over the reader's scroll area
  await a.mouse.wheel(0, 150)
  await a.waitForTimeout(400)
  const gapAfterScroll = await cardGap(a)
  check(Math.abs(gapAfterScroll - gap) < 3, "stamp card scrolls together with the text")
  await shot(a, "card-under-selection")
  await a.keyboard.press("Escape")
  await a.evaluate(() => window.getSelection().removeAllRanges())
  await a.getByRole("button", { name: "Perbesar halaman" }).click()
  await a.waitForFunction(() => document.querySelector('[data-page="1"]').getBoundingClientRect().width > 500)
  await a.waitForTimeout(400)
  await shot(a, "zoom-1.5x")
  check(true, "zoom makes pages wider (1.5×)")
  await a.getByRole("button", { name: "Perbesar halaman" }).click()
  await a.waitForFunction(() => document.querySelector('[data-page="1"]').getBoundingClientRect().width > 700)
  const panned = await a.evaluate(() => {
    const area = document.querySelector("[data-slot=reader-scroll]")
    area.scrollLeft = area.scrollWidth
    const page = document.querySelector('[data-page="1"]').getBoundingClientRect()
    const box = area.getBoundingClientRect()
    return { canPan: area.scrollWidth > area.clientWidth, rightGap: box.right - page.right }
  })
  check(panned.canPan && panned.rightGap >= -1, "at 2× the reader pans sideways to the page's right edge")
  await a.waitForTimeout(300)
  await shot(a, "zoom-2x-right-edge")
  await a.getByRole("button", { name: "Perbesar halaman" }).click()
  await a.waitForFunction(() => document.querySelector('[data-page="1"]').getBoundingClientRect().width < 420)

  console.log("5. S reads: Putu's mark stays hidden")
  await b.goto(`${roomUrl}/e/1`)
  await b.waitForSelector('[data-page="1"] .textLayer span', { timeout: 20000 })
  await b.getByText("1 cap Putu tersembunyi").waitFor({ timeout: 10000 })
  check((await b.locator('[data-page="1"] button', { hasText: "[wah!]" }).count()) === 0, "Putu's stamp is hidden from S")
  await selectText(b, 2, "unexpected harmonies")
  // like a person: tap the note box (this clears the text selection), type slowly, pause
  await b.getByPlaceholder("catatan (opsional)").click()
  await b.waitForTimeout(600)
  await b.keyboard.type("lagu apa yang bikin kamu merinding?", { delay: 30 })
  await b.waitForTimeout(800)
  check(await b.getByText("cap kalimat ini").isVisible(), "stamp card stays open while writing a note")
  await b.getByRole("button", { name: "[hah?]" }).click()
  await b.getByText("Dicap [hah?]").waitFor()
  check(true, "S stamped page 2 with a note")
  // S stamps the same sentence Putu did → a "Sama!" moment at the reveal
  await selectText(b, 1, "two-thirds of people report experiencing chills")
  await b.getByRole("button", { name: "[wah!]" }).click()
  await b.getByText("Dicap [wah!]").waitFor()
  check(true, "S stamped the same sentence as Putu")
  await b.evaluate(() => document.querySelector('[data-page="2"]').scrollIntoView({ block: "start" }))
  await b.locator("header", { hasText: "hal 2/3" }).waitFor()
  await shot(b, "reader-b")

  console.log("6. Presence and 'Sini dong'")
  await a.locator("header [data-slot=badge]", { hasText: /S.*hal \d/ }).waitFor({ timeout: 10000 })
  check(true, "Putu sees S online with a page number")
  await a.getByRole("button", { name: /Sini dong/ }).click()
  await b.getByText("Putu manggil kamu").waitFor({ timeout: 10000 })
  check(true, "S got the 'come here' call")
  await shot(b, "come-here")

  console.log("6b. Chat in the side panel")
  await a.getByRole("button", { name: "Obrolan" }).click()
  const input = a.getByPlaceholder("Tulis pesan…")
  const oneLine = (await input.boundingBox()).height
  await input.fill("Aku penasaran banget sama bagian ini. ".repeat(6) + "\nKamu gimana?\nTulis aja panjang.")
  const grown = (await input.boundingBox()).height
  await input.fill("Kalimat ".repeat(200))
  const capped = (await input.boundingBox()).height
  check(grown > oneLine * 2 && capped <= 180 && capped >= grown, `chat box grows with long text, then scrolls (${Math.round(oneLine)} → ${Math.round(grown)} → ${Math.round(capped)}px)`)
  await shot(a, "chat-long-input")
  await input.fill("halo, kamu di hal berapa?")
  await a.keyboard.press("Enter")
  await a.locator("[data-slot=bubble-content]", { hasText: "halo, kamu di hal berapa?" }).waitFor()
  check(Math.abs((await input.boundingBox()).height - oneLine) < 2, "chat box shrinks back after sending")
  await b.locator('button[aria-label="Obrolan"]', { hasText: "1" }).waitFor({ timeout: 10000 })
  check(true, "S sees an unread badge while the panel is closed")
  await b.getByRole("button", { name: "Obrolan" }).click()
  await b.locator("[data-slot=bubble-content]", { hasText: "halo, kamu di hal berapa?" }).waitFor()
  await b.getByPlaceholder("Tulis pesan…").fill("hal 2, lagi baca bagian trigger")
  await b.getByRole("button", { name: "Kirim" }).click()
  await a.locator("[data-slot=bubble-content]", { hasText: "hal 2, lagi baca bagian trigger" }).waitFor({ timeout: 10000 })
  check(true, "messages arrive live both ways")
  await shot(a, "chat-a")
  await b.reload()
  await b.getByRole("button", { name: "Obrolan" }).click()
  await b.locator("[data-slot=bubble-content]", { hasText: "halo, kamu di hal berapa?" }).waitFor({ timeout: 10000 })
  check(true, "chat history survives a reload")
  await b.getByRole("button", { name: "Tutup obrolan" }).click()
  await a.getByRole("button", { name: "· hal 2" }).click()
  await a.locator("header", { hasText: "hal 2/3" }).waitFor({ timeout: 5000 })
  check(true, "tapping 'hal 2' on a message jumps to that page")

  console.log("7. Both finish, then reveal together")
  await a.getByRole("button", { name: /Aku selesai/ }).click()
  await a.getByRole("button", { name: "Ya, aku selesai" }).click()
  await b.getByText("Putu selesai baca").waitFor({ timeout: 10000 })
  check(true, "S was pinged that Putu finished")
  await a.getByRole("button", { name: /Nunggu S/ }).waitFor()
  await b.getByRole("button", { name: /Aku selesai/ }).click()
  await b.getByRole("button", { name: "Ya, aku selesai" }).click()
  await b.getByText("Kalian berdua selesai.").waitFor({ timeout: 10000 })
  await a.getByText("Kalian berdua selesai.").waitFor({ timeout: 10000 })
  check(true, "reveal dialog opened on both phones")
  await b.getByText("Psst: ada 1 kalimat yang kalian cap sama.").waitFor()
  check(true, "reveal dialog teases the shared sentence without saying which")
  await shot(b, "reveal-dialog")
  await b.getByRole("dialog").getByRole("button", { name: /Buka bareng/ }).click()
  await a.locator('[data-page="2"] button', { hasText: "[hah?]" }).waitFor({ timeout: 10000 })
  check(true, "after the reveal, Putu sees S's stamp")
  await a.getByText("Kalian berdua cap 1 kalimat yang sama.").waitFor({ timeout: 10000 })
  await b.getByText("Kalian berdua cap 1 kalimat yang sama.").waitFor({ timeout: 10000 })
  check(true, "'Sama!' dialog shows on both phones after the reveal")
  await shot(a, "sama-dialog")
  await b.getByRole("button", { name: "Lihat di halaman" }).click()
  await a.keyboard.press("Escape")
  await a.locator('[data-page="1"]').scrollIntoViewIfNeeded()
  await shot(a, "revealed-a")

  console.log("8. Talk time, taking turns")
  await a.goto(`${roomUrl}/e/1/ngobrol`)
  await b.goto(`${roomUrl}/e/1/ngobrol`)
  await a.getByRole("heading", { name: "Sama!" }).waitFor()
  check(true, "talk time starts with the shared 'Sama!' card")
  await a.waitForSelector('[data-page="1"] .textLayer span', { timeout: 20000 })
  check(true, "the paper is shown during talk time")
  await a.waitForSelector('[data-page="1"] [data-focused]', { timeout: 10000 })
  const focusVisible = async (p, page) =>
    p.evaluate((page) => {
      const el = document.querySelector(`[data-page="${page}"] [data-focused]`)
      const area = document.querySelector("[data-slot=reader-scroll]").getBoundingClientRect()
      const box = el?.getBoundingClientRect()
      return Boolean(box && box.top >= area.top && box.bottom <= area.bottom)
    }, page)
  await a.waitForFunction(
    () => {
      const el = document.querySelector('[data-page="1"] [data-focused]')
      const area = document.querySelector("[data-slot=reader-scroll]").getBoundingClientRect()
      const box = el?.getBoundingClientRect()
      return box && box.top >= area.top && box.bottom <= area.bottom
    },
    null,
    { timeout: 5000 }
  )
  check(await focusVisible(a, 1), "the card's sentence is outlined and scrolled into view")
  if (AI) {
    await a.getByText("tanya AI: jelasin simpel").click()
    await a.getByText("Kira-kira 2 dari 3 orang").waitFor()
    check(true, "Putu's AI answer is on the talk card")
  }
  await shot(a, "talk-sama")
  await a.getByRole("button", { name: /Udah dibahas/ }).click()
  await b.getByText("Giliran S").first().waitFor({ timeout: 10000 })
  check(true, "either of you can move past the shared card")
  await a.getByText("Giliran S").first().waitFor({ timeout: 10000 })
  await a.waitForSelector('[data-page="2"] [data-focused]', { timeout: 10000 })
  await a.waitForTimeout(800) // smooth scroll
  check(await focusVisible(a, 2), "the paper follows to the next card (page 2)")
  await shot(a, "talk-with-paper")
  await a.getByRole("button", { name: /lihat paper/ }).click()
  check(!(await a.getByText("lagu apa yang bikin kamu merinding?").isVisible()), "on a phone the card folds away to show the paper")
  await shot(a, "talk-folded")
  await a.getByRole("button", { name: /buka kartu/ }).click()
  await a.getByText("lagu apa yang bikin kamu merinding?").waitFor()
  check(true, "S's note shows on the talk card")
  check(await a.getByRole("button", { name: "Dengerin S dulu" }).isDisabled(), "Putu cannot advance S's card")
  await shot(a, "talk-a-waiting")
  await b.getByRole("button", { name: /Beres ngobrol/ }).click()
  await a.getByRole("heading", { name: "Kita belajar hari ini" }).waitFor()
  await b.getByRole("heading", { name: "Kita belajar hari ini" }).waitFor({ timeout: 10000 })

  console.log("9. One line each, then archive")
  await a.getByPlaceholder("Satu kalimat").fill("Merinding karena musik itu soal kejutan di lagunya.")
  await a.getByRole("button", { name: "Simpan", exact: true }).click()
  await b.getByText("Merinding karena musik").waitFor({ timeout: 10000 })
  await b.getByPlaceholder("Satu kalimat").fill("Ternyata otak kita bisa beda kabelnya.")
  await b.getByRole("button", { name: "Simpan", exact: true }).click()
  await a.getByText("Ternyata otak kita").waitFor({ timeout: 10000 })
  await shot(a, "learnings")
  await a.getByRole("button", { name: "Simpan ke arsip" }).click()
  await a.getByText("Edisi lama").waitFor({ timeout: 10000 })
  await a.getByText("Siap edisi berikutnya").waitFor()
  check(true, "edition archived; shelf asks S to pick next")
  await shot(a, "shelf-archived")

  console.log("\nALL GOOD")
} catch (error) {
  console.error(error)
  await shot(a, "fail-a").catch(() => {})
  await shot(b, "fail-b").catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
