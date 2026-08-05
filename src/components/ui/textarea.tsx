import * as React from "react"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={`flex min-h-[100px] w-full resize-y rounded-xl border border-sand-200/90 bg-white px-4 py-3 text-sm leading-6 text-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(17,34,31,0.025)] transition-[border-color,box-shadow,background-color] duration-200 ease-in-out placeholder:text-ink-400 focus-visible:border-petroleum-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/15 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:opacity-60 ${className || ""}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"
