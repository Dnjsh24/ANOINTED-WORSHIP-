import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {compact ? (
        <BrandLogo compact className="h-9 w-9" />
      ) : (
        <span className="leading-tight">
          <BrandLogo className="h-8 max-w-44" />
          <span className="block font-mono text-[10px] uppercase text-violet-200/80">Worship Team Management</span>
        </span>
      )}
    </div>
  );
}
