import * as React from "react"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={`flex min-h-[100px] w-full resize-y rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm text-ink-950 shadow-premium-sm transition-colors placeholder:text-ink-400 focus-visible:border-petroleum-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/15 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:opacity-60 ${className || ""}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"
