"use client"

import * as React from "react"

const KEY = "bj-nav-collapsed"
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** Whether the floating bottom nav is folded into a small button. Remembered per phone. */
export function useNavCollapsed() {
  const collapsed = React.useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) === "1",
    () => false
  )
  const setCollapsed = React.useCallback((next: boolean) => {
    localStorage.setItem(KEY, next ? "1" : "0")
    listeners.forEach((listener) => listener())
  }, [])
  return [collapsed, setCollapsed] as const
}
