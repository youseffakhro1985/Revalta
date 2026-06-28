import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "destructive" | "success" | "warning";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const baseStyles = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-petroleum-600/20";
  
  const variants = {
    default: "bg-petroleum-600 text-white hover:bg-petroleum-700",
    secondary: "bg-sand-100 text-ink-900 hover:bg-sand-200",
    outline: "border border-sand-200 bg-white text-ink-900",
    destructive: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100",
    warning: "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className || ""}`} {...props} />
  )
}
