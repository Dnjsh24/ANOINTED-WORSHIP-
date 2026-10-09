import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  return (
    <Image
      src={compact ? "/brand/sunday-setlist-icon.svg" : "/brand/sunday-setlist-logo.svg"}
      alt="Sunday Setlist"
      width={compact ? 256 : 1100}
      height={compact ? 256 : 256}
      className={cn("h-8 w-auto object-contain", className)}
    />
  );
}
