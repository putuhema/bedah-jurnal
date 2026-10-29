// End-to-end: adding editions from "Pilihkan", from a link (journal page → PDF, web article,
// blocked site), reading/stamping an article, "Sama!" on an article, talk time, and Kamus kita.
//
// Needs e2e/mock-ai.mjs on :4010 and the app started with
//   ALLOW_PRIVATE_URLS=1 OPENALEX_URL=http://localhost:4010/openalex \
//   LLM_PROVIDER=openai-compatible LLM_BASE_URL=http://localhost:4010/v1 LLM_API_KEY=test-key LLM_MODEL=mock-model
// then: BASE_URL=http://localhost:3000 node e2e/sources.mjs
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const FIXTURES = process.env.FIXTURES_URL ?? "http://localhost:4010/fixtures"
const MOCK = process.env.MOCK_URL ?? "http://localhost:4010"
const here = fileURLToPath(new URL(".", import.meta.url))
const shots = `${here}screens`
mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ channel: "chrome", headless: true })
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }
const ctxA = await browser.newContext(phone)
const ctxB = await browser.newContext(phone)
const a = await ctxA.newPage()
const b = await ctxB.newPage()
for (const [name, p] of [["A", a], ["B", b]]) {
  p.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message))
  p.on("console", (m) => m.type() === "error" && console.log(`[${name} console]`, m.text().slice(0, 300)))
}

let step = 0
const shot = (p, name) =>
  p.screenshot({ path: `${shots}/src-${String(++step).padStart(2, "0")}-${name}.png`, caret: "initial" })
function check(cond, label) {
  if (!cond) throw new Error(`FAILED: ${label}`)
  console.log(`  ✓ ${label}`)
}

async function newRoom(p) {
  await p.goto(BASE)
  await p.getByLabel("Nama kamu").fill("Putu")
  await p.getByLabel("Nama dia").fill("S")
  await p.getByRole("button", { name: "Bikin ruang baca" }).click()
  await p.waitForURL(/\/r\/[A-Za-z0-9_-]+$/)
  return p.url()
}

async function openAddDialog(p, tab) {
  await p.getByRole("button", { name: /Tambah jurnal/ }).click()
  await p.getByRole("tab", { name: tab }).click()
}

async function pasteLink(p, url) {
  await openAddDialog(p, "Tempel link")
  await p.getByLabel("Link", { exact: true }).fill(url)
  await p.getByRole("button", { name: "Mulai edisi" }).click()
}

/** Selects `text` inside the article, like a long-press would. */
async function selectInArticle(p, text) {
  const ok = await p.evaluate((text) => {
    const root = document.querySelector(".bj-article")
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.data.indexOf(text)
      if (i < 0) continue
      const range = document.createRange()
      range.setStart(n, i)
      range.setEnd(n, i + text.length)
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      return true
    }
    return false
  }, text)
  if (!ok) throw new Error(`text not found in article: ${text}`)
  await p.locator("[data-slot=stamp-card]").waitFor({ timeout: 5000 })
}

const markText = (p, seat) =>
  p.evaluate((seat) => {
    // a stamp may be split across several <mark> pieces; join them
    const pieces = [...document.querySelectorAll(`.bj-article mark.bj-hl-${seat}`)]
    return pieces.map((m) => m.textContent).join("")
  }, seat)

try {
  /* ---------------- 1. Pilihkan ---------------- */
  console.log("1. Pilihkan jurnal")
  await newRoom(a)
  await a.getByRole("button", { name: /Tambah jurnal/ }).click()
  await a.getByRole("button", { name: "tidur" }).click()
  await a.locator("[data-slot=paper-results] li").first().waitFor({ timeout: 20000 })
  check((await a.locator("[data-slot=paper-results] li").count()) === 2, "topic search shows open-access papers")
  const searched = (await (await fetch(`${MOCK}/last-search`)).json()).search
  check(Boolean(searched), `the topic was turned into search keywords ("${searched?.slice(0, 40)}…")`)
  await shot(a, "pilihkan")
  await a.locator("[data-slot=paper-results] li").first().getByRole("button", { name: "Pilih ini" }).click()
  await a.waitForURL(/\/e\/1$/, { timeout: 30000 })
  await a.waitForSelector('[data-page="1"] .textLayer span', { timeout: 20000 })
  await a.locator("header", { hasText: "hal 1/3" }).waitFor({ timeout: 15000 })
  check(true, "picked paper's PDF is saved and opens; its page count is corrected (1/3)")

  /* ---------------- 2. journal page link → its PDF ---------------- */
  console.log("2. Journal page link")
  const room2 = await newRoom(a)
  await pasteLink(a, `${FIXTURES}/journal.html`)
  await a.waitForURL(/\/e\/1$/, { timeout: 30000 })
  await a.waitForSelector('[data-page="1"] .textLayer span', { timeout: 20000 })
  await a.goto(room2)
  await a.getByRole("heading", { name: "Why Do We Get Goosebumps From Music?" }).waitFor()
  check(true, "a journal page link saves the real PDF (title from the page's citation data)")

  /* ---------------- 3. blocked site ---------------- */
  console.log("3. Blocked site")
  await newRoom(a)
  await pasteLink(a, `${FIXTURES}/blocked.pdf`)
  await a.getByText("Situs ini menolak diunduh otomatis").waitFor({ timeout: 20000 })
  check(true, "a site that refuses downloads gives a clear message")
  await a.keyboard.press("Escape")

  /* ---------------- 4. a web article, both readers ---------------- */
  console.log("4. Web article")
  const room4 = await newRoom(a)
  await pasteLink(a, `${FIXTURES}/article.html`)
  await a.waitForURL(/\/e\/1$/, { timeout: 30000 })
  await a.getByRole("heading", { name: "Why do cats purr? The science of a mysterious sound" }).waitFor()
  const article = await a.locator(".bj-article").innerHTML()
  check(!/premium plan|Subscribe|Copyright|tracking/.test(article), "menus, ads, footer and scripts are removed")
  check(article.includes('src="http://localhost:4010/fixtures/cat.png"'), "images keep working (absolute links)")
  check(/href="http:\/\/localhost:4010\/fixtures\/journal\.html"[^>]*target="_blank"/.test(article), "links open in a new tab")
  await a.locator("header", { hasText: /\d+%/ }).waitFor()
  check(true, "an article shows progress as %")

  const sentence = "Cats purr at a frequency between 25 and 150 hertz"
  await selectInArticle(a, sentence)
  await a.getByPlaceholder("catatan (opsional)").fill("frekuensi penyembuh tulang?")
  await a.getByRole("button", { name: "[hah?]" }).click()
  await a.getByText("Dicap [hah?]").waitFor()
  check((await markText(a, "a")) === sentence, "stamp highlights exactly the selected words")
  check((await a.locator(".bj-article [data-bj-tag=mark]").count()) === 1, "the stamp tag sits inline in the text")

  await selectInArticle(a, "solicitation purr")
  await a.getByRole("button", { name: "artinya apa?" }).click()
  await a.locator("[data-slot=ai-answer]").getByText("Kira-kira 2 dari 3 orang").first().waitFor({ timeout: 15000 })
  await a.waitForTimeout(800)
  await a.getByRole("button", { name: "Batal" }).click()
  await a.evaluate(() => getSelection().removeAllRanges())
  await a.locator(".bj-article [data-slot=ai-tag]").waitFor({ timeout: 10000 })
  check(true, "an AI answer in an article leaves a ✦ AI tag")
  await shot(a, "article-reader")

  await a.reload()
  await a.locator(".bj-article mark.bj-hl-a").first().waitFor({ timeout: 15000 })
  check((await markText(a, "a")) === sentence, "after a reload the highlight is on the same words")

  // S joins: Putu's stamp is hidden; S stamps the same sentence
  await b.goto(room4)
  await b.getByRole("button", { name: /^S/ }).click()
  await b.getByRole("link", { name: "Kamus" }).click()
  await b.getByText("Kamus masih kosong").waitFor()
  check(true, "before the reveal, S's Kamus doesn't show Putu's entries")
  await b.goto(`${room4}/e/1`)
  await b.locator(".bj-article").waitFor()
  check((await b.locator(".bj-article mark.bj-hl-a").count()) === 0, "Putu's article stamp is hidden from S")
  await selectInArticle(b, sentence)
  await b.getByRole("button", { name: "[wah!]" }).click()
  await b.getByText("Dicap [wah!]").waitFor()

  // both finish → reveal → Sama!
  await a.getByRole("button", { name: /Aku selesai/ }).click()
  await b.getByRole("button", { name: /Aku selesai/ }).click()
  await b.getByText("Psst: ada 1 kalimat yang kalian cap sama.").waitFor({ timeout: 10000 })
  await b.getByRole("dialog").getByRole("button", { name: /Buka bareng/ }).click()
  await b.getByText("Kalian berdua cap 1 kalimat yang sama.").waitFor({ timeout: 10000 })
  check(true, "'Sama!' works on articles")
  await b.keyboard.press("Escape")
  await b.locator(".bj-article mark.bj-hl-a").first().waitFor({ timeout: 10000 })
  check(true, "after the reveal S sees Putu's article stamp")

  // talk time follows the article
  await a.goto(`${room4}/e/1/ngobrol`)
  await a.getByRole("heading", { name: "Sama!" }).waitFor()
  await a.locator(".bj-article [data-focused]").first().waitFor({ timeout: 10000 })
  check(true, "talk time shows the article and outlines the card's sentence")
  await shot(a, "article-talk")

  // Kamus kita
  await a.goto(`${room4}/kamus`)
  await a.locator("[data-slot=kamus] li").first().waitFor()
  const entries = await a.locator("[data-slot=kamus] li").allInnerTexts()
  check(entries.length === 2, `Kamus has 2 entries (${entries.length})`)
  check(entries.some((t) => t.includes(sentence) && t.includes("frekuensi penyembuh tulang?")), "a [hah?] stamp is in the Kamus with its note")
  check(entries.some((t) => t.includes("solicitation purr") && t.includes("Kira-kira 2 dari 3")), "an 'artinya apa?' answer is in the Kamus")
  await a.getByPlaceholder("Cari kata atau arti…").fill("solicitation")
  check((await a.locator("[data-slot=kamus] li").count()) === 1, "Kamus search filters entries")
  await shot(a, "kamus")
  await b.goto(`${room4}/kamus`)
  await b.locator("[data-slot=kamus] li").first().waitFor()
  check((await b.locator("[data-slot=kamus] li").count()) === 2, "after the reveal, S's Kamus shows Putu's entries too")

  console.log("\nALL GOOD")
} catch (error) {
  console.error(error)
  await shot(a, "fail-a").catch(() => {})
  await shot(b, "fail-b").catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
