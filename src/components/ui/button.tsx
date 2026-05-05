import Link from "next/link";
import { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";

type ButtonBaseProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
};

type ButtonAsButton = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: never;
  };

type ButtonAsLink = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> & {
    href: string;
  };

type Props = ButtonAsButton | ButtonAsLink;

export function Button({ href, children, variant = "primary", className = "", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-900/20";

  const styles = {
    primary: "bg-gray-950 text-white shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:bg-gray-800",
    secondary: "border border-gray-200 bg-white text-gray-900 shadow-sm hover:bg-gray-50 hover:text-gray-950",
    ghost: "text-gray-600 hover:text-gray-950 hover:bg-gray-100/80",
  };

  const classes = `${base} ${styles[variant]} ${className}`;

  if (href) {
    const { ...linkProps } = props as Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps>;
    return (
      <Link href={href} className={classes} {...linkProps}>
        {children}
      </Link>
    );
  }

  const { ...buttonProps } = props as Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps>;
  return (
    <button className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
