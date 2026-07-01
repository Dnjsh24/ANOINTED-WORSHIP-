import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-violet-500 text-white shadow-[0_0_24px_rgba(139,92,246,0.28)] hover:bg-violet-400",
  secondary: "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
  ghost: "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
  danger: "bg-red-500/15 text-red-200 hover:bg-red-500/25",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  className,
  variant = "primary",
  children,
}: {
  href: string;
  className?: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-300",
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
