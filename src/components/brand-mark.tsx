import { Music2 } from "lucide-react";
import { appName } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="inline-flex size-9 items-center justify-center rounded-md bg-violet-500 text-white">
        <Music2 className="size-5" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-bold text-white">{appName}</span>
          <span className="block font-mono text-[10px] uppercase text-violet-200/80">Worship Team Management</span>
        </span>
      )}
    </div>
  );
}
