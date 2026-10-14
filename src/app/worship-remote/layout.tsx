import type { ReactNode } from "react";
import { WoolyPublicScreen } from "@/components/wooly/wooly-public-screen";
import { isDesktopRuntime } from "@/lib/desktop/runtime";

export default function RemoteLayout({ children }: { children: ReactNode }) {
  return <>{!isDesktopRuntime() && <WoolyPublicScreen />}{children}</>;
}
