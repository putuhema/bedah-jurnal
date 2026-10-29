// Live check of "Tanya AI" against the real provider in .env.local (spends one small request).
//   BASE_URL=http://localhost:3000 node e2e/live-ai.mjs
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const here = fileURLToPath(new URL(".", import.meta.url))

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
try {
  await page.goto(BASE)
  await page.getByLabel("Nama kamu").fill("Putu")
  await page.getByLabel("Nama dia").fill("S")
  await page.getByRole("button", { name: "Bikin ruang baca" }).click()
  await page.waitForURL(/\/r\/[A-Za-z0-9_-]+$/)
  await page.getByRole("button", { name: /Tambah jurnal/ }).click()
  await page.getByRole("tab", { name: "Upload PDF" }).click()
  await page.locator("#pdf").setInputFiles(`${here}sample.pdf`)
  await page.getByRole("button", { name: "Mulai edisi" }).click()
  await page.waitForURL(/\/e\/1$/)
  await page.waitForSelector('[data-page="1"] .textLayer span')

  // select a sentence, then ask
  await page.evaluate(() => {
    const span = [...document.querySelectorAll('[data-page="1"] .textLayer span')].find((s) =>
      s.textContent.includes("two-thirds of people report experiencing chills")
    )
    const node = span.firstChild
    const start = node.textContent.indexOf("two-thirds")
    const range = document.createRange()
    range.setStart(node, start)
    range.setEnd(node, start + "two-thirds of people report experiencing chills".length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await page.getByText("cap kalimat ini").waitFor()
  const t0 = Date.now()
  await page.getByRole("button", { name: "jelasin simpel" }).click()
  await page.getByText("Jawaban AI terbaru ikut tersimpan di cap ini.").waitFor({ timeout: 60000 })
  const answer = await page.locator("[data-slot=ai-answer] p").nth(1).innerText()
  console.log(`answer (${Date.now() - t0} ms):\n${answer}\n`)
  if (/^\(|gagal|tidak valid|tidak ditemukan|tidak bisa dihubungi/i.test(answer.trim())) {
    throw new Error("the provider returned an error message")
  }

  await page.getByRole("button", { name: "[wah!]" }).click()
  await page.locator('[data-page="1"] button', { hasText: "[wah!]" }).click()
  await page.locator("[data-slot=stamp-card] [data-slot=ai-answer]").waitFor()
  await page.screenshot({ path: `${here}screens/live-ai.png` })
  console.log("✓ live AI answer streamed in and was saved on the stamp")
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
