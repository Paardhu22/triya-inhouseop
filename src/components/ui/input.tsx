"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

// Shared input styling — unchanged from the original, so every existing call site
// looks and behaves identically.
const INPUT_CLASS =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm"

// Types whose native UI (pickers, spinners, swatches, checkable controls) the
// animated caret would interfere with — these always render the plain input.
const PLAIN_TYPES = new Set([
  "password", // bullet glyphs would misalign the measured caret
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "file",
  "number",
  "color",
  "range",
  "checkbox",
  "radio",
])

type InputProps = React.ComponentProps<"input"> & {
  /** Force the plain input (opt out of the smooth caret) when needed. */
  plain?: boolean
}

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.RefObject<T | null>).current = node
    }
  }
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, plain, ...props },
  ref,
) {
  const prefersReducedMotion = useReducedMotion()
  const smooth = !plain && !prefersReducedMotion && (type === undefined || !PLAIN_TYPES.has(type))

  if (!smooth) {
    return (
      <input ref={ref} type={type} data-slot="input" className={cn(INPUT_CLASS, className)} {...props} />
    )
  }

  return <SmoothInput ref={ref} type={type} className={className} {...props} />
})

// A subtle spring-animated caret rendered over a normally-styled input. The real
// <input> stays fully native (typing, selection, IME, validation, ref) — only the
// caret colour is hidden and replaced with the animated overlay. Falls back to the
// native caret while composing (IME) so non-Latin entry is never misaligned.
const SmoothInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function SmoothInput({ className, value, defaultValue, onChange, ...props }, forwardedRef) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const caretRef = React.useRef<HTMLDivElement>(null)
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
    const composingRef = React.useRef(false)

    const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
    const [caretX, setCaretX] = React.useState(0)
    const [caretOpacity, setCaretOpacity] = React.useState(0)
    const prefersReducedMotion = useReducedMotion()

    const isControlled = value !== undefined
    const inputValue = isControlled ? value : internalValue
    const valueKey = String(inputValue ?? "")

    const setRefs = React.useMemo(() => mergeRefs(inputRef, forwardedRef), [forwardedRef])

    React.useEffect(() => {
      const input = inputRef.current
      const caret = caretRef.current
      const container = containerRef.current
      if (!input || !caret || !container) return

      if (!canvasRef.current) canvasRef.current = document.createElement("canvas")
      const canvas = canvasRef.current

      const css = (el: HTMLElement, prop: string) =>
        window.getComputedStyle(el).getPropertyValue(prop)

      const textWidth = (text: string) => {
        const ctx = canvas.getContext("2d")
        if (!ctx) return 0
        ctx.font = `${css(input, "font-size")} ${css(input, "font-family")}`
        return ctx.measureText(text).width
      }

      const paddingLeft = parseInt(css(input, "padding-left")) || 0
      const fontSize = parseFloat(css(input, "font-size")) || 14
      caret.style.height = `${Math.max(fontSize, fontSize * 1.1)}px`

      const maxX = (container.offsetWidth || 0) - 6

      const place = () => {
        if (composingRef.current) {
          setCaretOpacity(0)
          return
        }
        const pos = input.selectionStart ?? input.value.length
        const x = paddingLeft + 2 + textWidth(input.value.slice(0, pos))
        if (x <= maxX) {
          setCaretX(x)
          setCaretOpacity(1)
        }
      }

      const onFocus = () => place()
      const onBlur = () => setCaretOpacity(0)
      const onCompStart = () => {
        composingRef.current = true
        setCaretOpacity(0)
      }
      const onCompEnd = () => {
        composingRef.current = false
        place()
      }

      input.addEventListener("focus", onFocus)
      input.addEventListener("blur", onBlur)
      input.addEventListener("input", place)
      input.addEventListener("keyup", place)
      input.addEventListener("click", place)
      input.addEventListener("select", place)
      input.addEventListener("compositionstart", onCompStart)
      input.addEventListener("compositionend", onCompEnd)

      if (document.activeElement === input) place()

      return () => {
        input.removeEventListener("focus", onFocus)
        input.removeEventListener("blur", onBlur)
        input.removeEventListener("input", place)
        input.removeEventListener("keyup", place)
        input.removeEventListener("click", place)
        input.removeEventListener("select", place)
        input.removeEventListener("compositionstart", onCompStart)
        input.removeEventListener("compositionend", onCompEnd)
      }
    }, [valueKey])

    return (
      <div ref={containerRef} className="relative w-full min-w-0">
        <input
          ref={setRefs}
          data-slot="input"
          className={cn(INPUT_CLASS, "caret-transparent", className)}
          value={isControlled ? value : internalValue}
          onChange={(e) => {
            if (!isControlled) setInternalValue(e.target.value)
            onChange?.(e)
          }}
          {...props}
        />
        <motion.div
          ref={caretRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 w-0.5 rounded-full bg-foreground"
          animate={{ x: caretX, y: "-50%", opacity: caretOpacity }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 500, damping: 30, mass: 0.5 }
          }
        />
      </div>
    )
  },
)

export { Input }
