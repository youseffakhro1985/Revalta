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
    destructive: "border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100",
    success: "border-success-200 bg-success-50 text-success-700 hover:bg-success-100",
    warning: "border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className || ""}`} {...props} />
  )
}
