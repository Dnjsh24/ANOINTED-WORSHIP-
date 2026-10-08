import type { ReactNode } from "react";
import { PresentationFonts } from "@/components/presentation-fonts";

export default function PresentationLayout({ children }: { children: ReactNode }) {
  return <><PresentationFonts />{children}</>;
}
