import { cn } from "@/lib/utils";

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(
          "inline-flex size-9 shrink-0 object-cover rounded-full border border-white/10",
          className
        )}
      />
    );
  }

  const safeInitials = initials || name.slice(0, 2).toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-violet-400/15 text-xs font-bold text-violet-100",
        className,
      )}
    >
      {safeInitials}
    </span>
  );
}
