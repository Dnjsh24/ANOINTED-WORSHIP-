import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-normal text-violet-100",
        className,
      )}
      {...props}
    />
  );
}
