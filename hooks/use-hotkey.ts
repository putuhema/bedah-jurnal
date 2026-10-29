"use client"

import * as React from "react"

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

/** Single-key shortcut (e.g. "d"), ignored while typing or with modifier keys. */
export function useHotkey(key: string, handler: () => void, enabled = true) {
  const ref = React.useRef(handler)
  React.useEffect(() => {
    ref.current = handler
  })

  React.useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return
      if (
        isTyping(event.target) ||
        document.querySelector("[data-slot=dialog-content]")
      )
        return
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      event.preventDefault()
      ref.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [key, enabled])
}
