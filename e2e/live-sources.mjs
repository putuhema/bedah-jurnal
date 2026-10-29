// Live check against the real internet (OpenAlex, a journal site, Wikipedia) and the AI in .env.local.
//   BASE_URL=http://localhost:3000 node e2e/live-sources.mjs
import { chromium } from "playwright-core"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const JOURNAL_PAGE = "https://www.frontiersin.org/articles/10.3389/fnsys.2014.00219/full"
const ARTICLE = "https://en.wikipedia.org/wiki/Purr"

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

async function newRoom() {
  await page.goto(BASE)
  await page.getByLabel("Nama kamu").fill("Putu")
  await page.getByLabel("Nama dia").fill("S")
  await page.getByRole("button", { name: "Bikin ruang baca" }).click()
  await page.waitForURL(/\/r\/[A-Za-z0-9_-]+$/)
  return page.url()
}

async function pasteLink(url) {
  await page.getByRole("button", { name: /Tambah jurnal/ }).click()
  await page.getByRole("tab", { name: "Tempel link" }).click()
  await page.getByLabel("Link", { exact: true }).fill(url)
  await page.getByRole("button", { name: "Mulai edisi" }).click()
  await Promise.race([
    page.waitForURL(/\/e\/1$/, { timeout: 60000 }),
    page.locator("[data-slot=field-error]").waitFor({ timeout: 60000 }).then(async () => {
      throw new Error(await page.locator("[data-slot=field-error]").innerText())
    }),
  ])
}

let failed = false
async function run(label, fn) {
  const t0 = Date.now()
  try {
    console.log(`✓ ${label}: ${await fn()} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  } catch (error) {
    failed = true
    console.log(`✗ ${label}: ${error.message.split("\n")[0]}`)
  }
}

await run("Pilihkan 'kucing'", async () => {
  await newRoom()
  await page.getByRole("button", { name: /Tambah jurnal/ }).click()
  await page.getByPlaceholder(/Topik apa/).fill("kucing")
  await page.getByRole("button", { name: "Cari" }).click()
  await page.locator("[data-slot=paper-results] li").first().waitFor({ timeout: 30000 })
  const searched = await page.locator("text=dicari:").innerText()
  const titles = await page.locator("[data-slot=paper-results] li p.font-serif").allInnerTexts()
  // pick the first PDF result; if a site blocks it, try the next one
  const items = page.locator("[data-slot=paper-results] li")
  for (let i = 0; i < (await items.count()); i++) {
    await items.nth(i).getByRole("button", { name: "Pilih ini" }).click()
    const ok = await page
      .waitForURL(/\/e\/1$/, { timeout: 45000 })
      .then(() => true)
      .catch(() => false)
    if (ok) {
      await page.waitForSelector('[data-page="1"] .textLayer span', { timeout: 30000 })
      return `${searched} → ${titles.length} papers, opened #${i + 1} "${titles[i].slice(0, 60)}"`
    }
  }
  throw new Error("no result could be imported")
})

await run("Journal page (Frontiers)", async () => {
  await newRoom()
  await pasteLink(JOURNAL_PAGE)
  await page.waitForSelector('[data-page="1"] .textLayer span', { timeout: 30000 })
  const label = await page.locator("header").innerText()
  return `saved as PDF, ${label.match(/hal \d+\/\d+/)?.[0]}`
})

await run("Web article (Wikipedia)", async () => {
  await newRoom()
  await pasteLink(ARTICLE)
  await page.locator(".bj-article p").first().waitFor({ timeout: 30000 })
  const title = await page.locator("article h1").innerText()
  const paragraphs = await page.locator(".bj-article p").count()
  return `"${title}", ${paragraphs} paragraphs`
})

await browser.close()
if (failed) process.exitCode = 1
