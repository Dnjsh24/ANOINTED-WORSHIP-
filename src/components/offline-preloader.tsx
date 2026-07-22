"use client";

import { useEffect, useState } from "react";
import { DownloadCloud, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function OfflinePreloader({ setlistId, songIds }: { setlistId: string; songIds: string[] }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const router = useRouter();

  useEffect(() => {
    if (!setlistId || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    
    // Slight delay so we don't block the main render
    const timer = setTimeout(() => {
      prefetchData();
    }, 2000);

    return () => clearTimeout(timer);
  }, [setlistId, songIds]);

  async function prefetchData() {
    setStatus("loading");
    try {
      const urlsToCache = [
        `/setlists/${setlistId}`,
        ...songIds.map(id => `/songs/${id}`)
      ];

      // Next.js router.prefetch will fetch the RSC payload
      // We also do a normal fetch to cache the HTML for direct offline loads
      await Promise.all([
        ...urlsToCache.map(url => {
          router.prefetch(url);
          return fetch(url, { headers: { "X-Prefetch": "true" } }).catch(() => {});
        })
      ]);
      
      setStatus("done");
    } catch (e) {
      console.error("[PWA] Preload error:", e);
      setStatus("idle");
    }
  }

  if (status === "idle") return null;

  return (
    <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-white shadow-xl">
      {status === "loading" ? (
        <>
          <DownloadCloud className="size-3.5 text-violet-400 animate-pulse" />
          <span className="text-zinc-300">Caching...</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-3.5 text-emerald-400" />
          <span className="text-emerald-100">Available Offline</span>
        </>
      )}
    </div>
  );
}
