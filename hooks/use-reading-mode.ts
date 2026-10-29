"use client"

import * as React from "react"

// one reader at a time, so a tiny shared store is enough
let reading = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setReadingMode(next: boolean) {
  if (reading === next) return
  reading = next
  listeners.forEach((listener) => listener())
}

/** Reading mode: the header, nav and buttons step aside so the paper gets the screen. */
export function useReadingMode() {
  return React.useSyncExternalStore(
    subscribe,
    () => reading,
    () => false
  )
}
