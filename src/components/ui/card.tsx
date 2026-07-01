import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("rounded-lg border border-white/10 bg-[#18171c] shadow-2xl shadow-black/20", className)} {...props} />;
}

export function Panel({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={cn("rounded-lg border border-white/10 bg-[#17161b] p-5", className)} {...props} />;
}
