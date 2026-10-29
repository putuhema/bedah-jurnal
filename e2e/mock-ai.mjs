// A tiny stand-in for an AI API, for testing "Tanya AI" without a real key.
// Speaks both the Claude Messages API (POST /v1/messages) and the OpenAI-compatible
// Chat Completions API (POST /v1/chat/completions), streams a fixed answer in each
// one's real SSE format, and remembers the last request so the test can check it.
//   node e2e/mock-ai.mjs            (listens on :4010)
//   GET /last-request                      → the last request body as JSON
// Point the app at it with ANTHROPIC_BASE_URL=http://localhost:4010 ANTHROPIC_API_KEY=test
import { readFileSync } from "node:fs"
import { createServer } from "node:http"

const PORT = Number(process.env.MOCK_PORT ?? 4010)
const ANSWER = [
  "Frisson itu rasa merinding ",
  "waktu dengar musik. ",
  "Kira-kira 2 dari 3 orang pernah ngalamin ini.",
]
let lastRequest = null
let lastSearch = null

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/last-request") {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify(lastRequest ?? {}))
  }

  // ---- fixtures for importing links (needs ALLOW_PRIVATE_URLS=1 on the app) ----
  if (req.method === "GET" && req.url?.startsWith("/fixtures/")) {
    const name = req.url.slice("/fixtures/".length).split("?")[0]
    if (name === "cat.png") {
      // 1×1 transparent PNG
      res.writeHead(200, { "content-type": "image/png" })
      return res.end(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          "base64"
        )
      )
    }
    if (name === "blocked.pdf") {
      res.writeHead(403, { "content-type": "text/html" })
      return res.end("<h1>Forbidden</h1>")
    }
    const files = {
      "article.html": ["fixtures/article.html", "text/html; charset=utf-8"],
      "journal.html": ["fixtures/journal.html", "text/html; charset=utf-8"],
      "paper.pdf": ["sample.pdf", "application/pdf"],
    }
    const file = files[name]
    if (!file) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { "content-type": file[1] })
    return res.end(readFileSync(new URL(file[0], import.meta.url)))
  }

  // ---- a tiny OpenAlex stand-in (point the app at it with OPENALEX_URL) ----
  if (req.method === "GET" && req.url?.startsWith("/openalex/works")) {
    lastSearch = new URL(req.url, "http://x").searchParams.get("search")
    const words = (text) =>
      Object.fromEntries(text.split(" ").map((w, i) => [w, [i]]))
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(
      JSON.stringify({
        results: [
          {
            id: "https://openalex.org/W1",
            title: "Why Do We Get Goosebumps From Music?",
            publication_year: 2016,
            cited_by_count: 112,
            abstract_inverted_index: words("Roughly two-thirds of people report chills while listening to music."),
            best_oa_location: {
              pdf_url: `http://localhost:${PORT}/fixtures/paper.pdf`,
              landing_page_url: `http://localhost:${PORT}/fixtures/journal.html`,
              source: { display_name: "Frontiers in Psychology" },
            },
          },
          {
            id: "https://openalex.org/W2",
            title: "Why do cats purr?",
            publication_year: 2021,
            cited_by_count: 9,
            abstract_inverted_index: words("Cats purr between 25 and 150 hertz."),
            best_oa_location: {
              pdf_url: null,
              landing_page_url: `http://localhost:${PORT}/fixtures/article.html`,
              source: { display_name: "Science Weekly" },
            },
          },
        ],
      })
    )
  }
  if (req.method === "GET" && req.url === "/last-search") {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify({ search: lastSearch }))
  }

  if (req.method === "POST" && req.url?.startsWith("/v1/chat/completions")) {
    let raw = ""
    for await (const chunk of req) raw += chunk
    lastRequest = { path: req.url, headers: req.headers, body: JSON.parse(raw) }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
    const base = { id: "chatcmpl-mock", object: "chat.completion.chunk", created: 0, model: lastRequest.body.model }
    const send = (delta, finish_reason = null) =>
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    send({ role: "assistant", content: "" })
    for (const text of ANSWER) {
      await new Promise((r) => setTimeout(r, 150))
      send({ content: text })
    }
    send({}, "stop")
    res.write("data: [DONE]\n\n")
    return res.end()
  }
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404)
    return res.end()
  }

  let raw = ""
  for await (const chunk of req) raw += chunk
  lastRequest = { path: req.url, headers: req.headers, body: JSON.parse(raw) }

  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
  sse(res, "message_start", {
    type: "message_start",
    message: {
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: lastRequest.body.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 1 },
    },
  })
  sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
  for (const text of ANSWER) {
    await new Promise((r) => setTimeout(r, 150)) // so the test sees it stream
    sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })
  }
  sse(res, "content_block_stop", { type: "content_block_stop", index: 0 })
  sse(res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: 30 },
  })
  sse(res, "message_stop", { type: "message_stop" })
  res.end()
}).listen(PORT, () => console.log(`mock Claude API on :${PORT}`))
