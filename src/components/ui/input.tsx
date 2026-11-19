"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { FieldMic, splitLayoutClasses } from "./field-mic"

// Field types where speaking makes sense. Email, password, date and file stay as they were.
const VOICE_TYPES = new Set([undefined, "text", "search", "number"])

type InputProps = React.ComponentProps<"input"> & {
  /** Show the dictation mic (default on for text, search and number fields). */
  voice?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, voice = true, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)
    const withMic = voice && VOICE_TYPES.has(type)
    const [wrapperClass, fieldClass] = withMic ? splitLayoutClasses(className) : ["", className]

    const input = (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "number" && "tabular-nums",
          fieldClass,
          withMic && "[grid-area:1/1]",
          withMic && !props.disabled && "pr-9"
        )}
        ref={innerRef}
        {...props}
      />
    )
    if (!withMic) return input
    return (
      <div className={cn("grid w-full", wrapperClass)}>
        {input}
        {!props.disabled && !props.readOnly && <FieldMic target={innerRef} />}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
