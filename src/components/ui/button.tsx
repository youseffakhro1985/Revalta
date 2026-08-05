import Link from "next/link";
import { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ href, children, variant = "primary", className = "", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-[background-color,border-color,color,box-shadow,opacity] duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60";

  const styles = {
    primary: "border border-petroleum-700/15 bg-petroleum-600 text-white shadow-premium-sm hover:bg-petroleum-700 hover:shadow-premium-md",
    secondary: "border border-sand-200/90 bg-white text-ink-900 shadow-premium-sm hover:border-sand-300 hover:bg-sand-50/80 hover:text-petroleum-700",
    ghost: "text-ink-600 hover:bg-sand-100/65 hover:text-petroleum-700",
  };

  const classes = `${base} ${styles[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
