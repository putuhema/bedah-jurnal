import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { AiKind } from "@/lib/types"

/**
 * "Tanya AI" settings (in .env.local):
 *
 *   LLM_PROVIDER   openai-compatible (or the provider name: openrouter, groq, deepseek,
 *                  openai, ollama, …) | anthropic. Empty: guessed from the other values.
 *   LLM_BASE_URL   e.g. https://openrouter.ai/api/v1  (optional for anthropic)
 *   LLM_API_KEY    the provider's key (local servers like Ollama need none)
 *   LLM_MODEL      the provider's model name (anthropic default: claude-opus-5-5)
 *
 * The older OPENAI_* / ANTHROPIC_* names still work as a fallback.
 */
export type AiProvider = "openai-compatible" | "anthropic"

type LlmConfig = {
  provider: AiProvider
  model: string
  baseURL?: string
  apiKey?: string
}

function env(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export function llmConfig(): LlmConfig | null {
  const declared = env("LLM_PROVIDER")?.toLowerCase()
  const wantsAnthropic = declared === "anthropic" || declared === "claude"

  const compatible = {
    baseURL: env("LLM_BASE_URL") ?? env("OPENAI_BASE_URL"),
    model: env("LLM_MODEL") ?? env("OPENAI_MODEL"),
    apiKey: env("LLM_API_KEY") ?? env("OPENAI_API_KEY"),
  }
  const claude = {
    baseURL: wantsAnthropic ? env("LLM_BASE_URL") : undefined,
    model: env("LLM_MODEL") ?? env("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
    apiKey: env("LLM_API_KEY") ?? env("ANTHROPIC_API_KEY"),
  }

  const useCompatible = declared ? !wantsAnthropic : Boolean(compatible.baseURL)
  if (useCompatible) {
    // needs at least a URL and a model; local servers often need no key
    return compatible.baseURL && compatible.model
      ? {
          provider: "openai-compatible",
          ...compatible,
          model: compatible.model,
        }
      : null
  }
  return claude.apiKey ? { provider: "anthropic", ...claude } : null
}

export function aiProvider(): AiProvider | null {
  return llmConfig()?.provider ?? null
}

export function aiEnabled() {
  return llmConfig() !== null
}

/** Questions per room per 24 hours, so a busy week can't run up a surprise bill. */
export const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 40)

/** Upper bound on answer length (tokens). Answers are ~120 words, this leaves room. */
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS ?? 1200)

// Kept byte-identical across requests so providers can cache it.
export const SYSTEM_PROMPT = `Kamu teman belajar untuk dua orang (pasangan) yang membaca jurnal ilmiah bareng dari jauh. Mereka bukan ahli di bidangnya.

Aturan menjawab:
- Bahasa Indonesia santai dan hangat, seperti teman yang pintar menjelaskan. Istilah teknis boleh disebut, tapi langsung jelaskan.
- Singkat: 60 sampai 120 kata. Paling banyak satu daftar pendek kalau benar-benar membantu. Tanpa judul.
- Berpegang pada teks jurnal yang diberikan. Kalau teksnya tidak cukup untuk menjawab, bilang terus terang lalu beri penjelasan umum yang ditandai sebagai pengetahuan umum.
- Jangan mengarang angka, nama, atau kutipan yang tidak ada di teks.
- Teks biasa saja: jangan pakai format Markdown (tanpa tanda bintang, pagar, atau backtick), karena jawaban ditampilkan apa adanya.
- Langsung jawab, tanpa basa-basi pembuka.`

export const KIND_INSTRUCTION: Record<AiKind, string> = {
  simpel:
    "Jelaskan kalimat yang ditandai dengan bahasa sehari-hari, seperti menjelaskan ke teman yang bukan dari bidang ini. Kalau membantu, pakai satu perumpamaan.",
  istilah:
    "Jelaskan arti istilah, singkatan, atau jargon di kalimat yang ditandai. Untuk tiap istilah: artinya apa dan kenapa penting di kalimat ini.",
  klaim:
    "Nilai seberapa kuat klaim di kalimat yang ditandai, berdasarkan teks: jenis buktinya apa (misalnya studi kecil, potong-lintang, meta-analisis), apa batasannya, dan kesimpulan yang adil. Akhiri dengan satu kalimat: 'Kesimpulan: kuat / lumayan / masih lemah' beserta alasannya.",
}

/* ---------- clients ---------- */

let openaiClient: OpenAI | undefined
function openai(config: LlmConfig) {
  openaiClient ??= new OpenAI({
    baseURL: config.baseURL,
    // some local servers accept any key; the SDK still needs a non-empty string
    apiKey: config.apiKey ?? "not-needed",
  })
  return openaiClient
}

let anthropicClient: Anthropic | undefined
function anthropic(config: LlmConfig) {
  anthropicClient ??= new Anthropic({
    apiKey: config.apiKey,
    // undefined → the SDK's default (or ANTHROPIC_BASE_URL)
    baseURL: config.baseURL,
  })
  return anthropicClient
}

/** True for the official OpenAI API, which wants max_completion_tokens instead of max_tokens. */
function isOfficialOpenAI(config: LlmConfig) {
  try {
    return new URL(config.baseURL ?? "").hostname === "api.openai.com"
  } catch {
    return false
  }
}

/* ---------- streaming ---------- */

/**
 * Streams the answer as text chunks. Ends with a short note in parentheses
 * when the model declined or ran out of room.
 */
export async function* streamAnswer(
  user: string,
  signal: AbortSignal,
  system: string = SYSTEM_PROMPT
): AsyncGenerator<string> {
  const config = llmConfig()

  if (config?.provider === "openai-compatible") {
    const limit = isOfficialOpenAI(config)
      ? { max_completion_tokens: MAX_TOKENS }
      : { max_tokens: MAX_TOKENS }
    const stream = await openai(config).chat.completions.create(
      {
        model: config.model,
        stream: true,
        ...limit,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { signal }
    )
    let finish: string | null = null
    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      // only the visible answer; some providers also stream reasoning, which we skip
      if (choice?.delta?.content) yield choice.delta.content
      if (choice?.finish_reason) finish = choice.finish_reason
    }
    if (finish === "length") yield "…"
    if (finish === "content_filter")
      yield "\n\n(AI tidak bisa menjawab pertanyaan ini.)"
    return
  }

  if (config?.provider === "anthropic") {
    const stream = anthropic(config).beta.messages.stream(
      {
        model: config.model,
        max_tokens: 4000,
        output_config: { effort: "low" },
        // on a policy decline, retry on Anthropic's recommended fallback model
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [
          {
            type: "text",
            text: system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: user }],
      },
      { signal }
    )
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text
      }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === "refusal")
      yield "\n\n(AI tidak bisa menjawab pertanyaan ini.)"
    if (final.stop_reason === "max_tokens") yield "…"
    return
  }

  throw new Error("AI is not configured")
}

/** A short, friendly message for a failed request (details go to the server log). */
export function aiErrorMessage(error: unknown): string {
  const status =
    error instanceof OpenAI.APIError || error instanceof Anthropic.APIError
      ? error.status
      : undefined
  if (status === 401 || status === 403) return "Kunci API AI tidak valid."
  if (status === 404) return "Model AI tidak ditemukan. Cek nama modelnya."
  if (status === 429)
    return "AI lagi sibuk atau kuotanya habis, coba sebentar lagi."
  if (
    error instanceof OpenAI.APIConnectionError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return "Server AI tidak bisa dihubungi. Cek alamat URL-nya."
  }
  return "AI gagal menjawab. Coba lagi."
}

/**
 * Turns a topic typed in any language ("tidur", "kenapa kucing mendengkur")
 * into a short English search query. Falls back to the topic as typed.
 */
export async function searchKeywords(topic: string): Promise<string> {
  if (!aiEnabled()) return topic
  try {
    let out = ""
    for await (const chunk of streamAnswer(
      `Topik: ${topic}`,
      AbortSignal.timeout(12_000),
      "Ubah topik dari pengguna jadi 2 sampai 5 kata kunci bahasa Inggris untuk mencari paper ilmiah. Balas HANYA kata kuncinya dalam satu baris, tanpa tanda kutip atau penjelasan."
    )) {
      out += chunk
    }
    const line =
      out
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean) ?? ""
    const clean = line
      .replace(/["'`*]/g, "")
      .slice(0, 120)
      .trim()
    return clean || topic
  } catch {
    return topic
  }
}
