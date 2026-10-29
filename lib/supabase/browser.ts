"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | undefined

/**
 * Browser client with the publishable (anon) key.
 * Used only for realtime presence/broadcast and for uploading to a signed URL.
 * It cannot read any table: RLS has no policies.
 */
export function browserClient(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    )
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
