import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "destructive" | "success" | "warning";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const baseStyles = "inline-flex min-h-6 items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold leading-none transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/20 focus-visible:ring-offset-2";
  
  const variants = {
    default: "bg-petroleum-600 text-white hover:bg-petroleum-700",
    secondary: "bg-sand-100 text-ink-900 hover:bg-sand-200",
    outline: "border-sand-200 bg-white text-ink-900",
    destructive: "border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    warning: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className || ""}`} {...props} />
  )
}
