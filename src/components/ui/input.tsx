import * as React from "react"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-11 w-full rounded-xl border border-sand-200 bg-white px-4 py-2 text-sm text-ink-950 shadow-premium-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-400 focus-visible:border-petroleum-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/15 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:opacity-60 ${className || ""}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"
