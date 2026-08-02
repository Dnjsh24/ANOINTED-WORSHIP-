"use client";

import { useEffect, useState } from "react";
import { DownloadCloud, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function OfflinePreloader({ setlistId, songIds }: { setlistId: string; songIds: string[] }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const router = useRouter();

  useEffect(() => {
    if (!setlistId || typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const prefetchData = async () => {
      setStatus("loading");
      try {
        const urlsToPrepare = [
          `/setlists/${setlistId}`,
          ...songIds.map((id) => `/songs/${id}`),
        ];

        // Keep navigation warm for this signed-in browser session. Private HTML
        // and RSC responses are deliberately not persisted in the service worker.
        urlsToPrepare.forEach((url) => router.prefetch(url));
        setStatus("done");
      } catch (error) {
        console.error("[PWA] Preload error:", error);
        setStatus("idle");
      }
    };

    // Slight delay so we don't block the main render
    const timer = setTimeout(() => {
      void prefetchData();
    }, 2000);

    return () => clearTimeout(timer);
  }, [router, setlistId, songIds]);

  if (status === "idle") return null;

  return (
    <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-white shadow-xl">
      {status === "loading" ? (
        <>
          <DownloadCloud className="size-3.5 text-violet-400 animate-pulse" />
          <span className="text-zinc-300">Preparing...</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-3.5 text-emerald-400" />
          <span className="text-emerald-100">Ready to open</span>
        </>
      )}
    </div>
  );
}
