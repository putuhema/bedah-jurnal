import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | undefined

/**
 * Server-side Supabase client with the secret (service-role) key.
 * It bypasses RLS, so every caller must check the room secret and seat first.
 */
export function admin(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Copy .env.example to .env.local and fill it in."
    )
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

export const PDF_BUCKET = "journals"
