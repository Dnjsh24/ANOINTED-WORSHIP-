"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, X } from "lucide-react";

export function PwaRegister() {
  const [isOnline, setIsOnline] = useState(true);
  const [showStatusToast, setShowStatusToast] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // 1. Initial connection status
    setIsOnline(navigator.onLine);

    // 2. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registered with scope:", reg.scope);
          setSwRegistration(reg);

          // Check if there is an update waiting
          if (reg.waiting) {
            setHasUpdate(true);
          }

          // Listen for new service worker installs
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.log("[PWA] New update found and ready to activate.");
                  setHasUpdate(true);
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error("[PWA] Service Worker registration failed:", err);
        });
    }

    // 3. Connection listeners
    function handleOnline() {
      setIsOnline(true);
      setShowStatusToast(true);
      setTimeout(() => setShowStatusToast(false), 5000);
      
      // Auto-trigger push notification for reconnection
      showLocalNotification("Back Online!", {
        body: "Your worship workspace has successfully reconnected to the server.",
        icon: "/icon-192.png",
      });
    }

    function handleOffline() {
      setIsOnline(false);
      setShowStatusToast(true);
      
      // Trigger notification for offline mode
      showLocalNotification("Connection Offline", {
        body: "You are currently running in offline mode. Setlists and song library can still be browsed.",
        icon: "/icon-192.png",
      });
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Request Notification permission on mount
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          console.log("[PWA] Notification permission status:", permission);
        });
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Show local push notification helper
  function showLocalNotification(title: string, options: NotificationOptions) {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      if (swRegistration) {
        swRegistration.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
    }
  }

  // Force sw update reload
  function handleUpdateReload() {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  }

  return (
    <>
      {/* Offline/Online Status Toast */}
      {showStatusToast && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between rounded-xl border border-white/10 bg-[#111014]/95 p-4 shadow-2xl backdrop-blur sm:left-auto sm:right-6 sm:w-80 animate-slide-left">
          <div className="flex items-center gap-3">
            {isOnline ? (
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Wifi className="size-4.5" />
              </span>
            ) : (
              <span className="flex size-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                <WifiOff className="size-4.5" />
              </span>
            )}
            <div>
              <p className="text-xs font-bold text-white">
                {isOnline ? "Connected to Internet" : "No Internet Connection"}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-zinc-400">
                {isOnline ? "All setlists and changes are fully synced." : "Using locally cached database offline."}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowStatusToast(false)}
            className="rounded-full p-1 text-zinc-500 hover:bg-white/[0.04] hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* App Update Toast */}
      {hasUpdate && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between rounded-xl border border-violet-500/20 bg-violet-600/10 p-4 shadow-2xl backdrop-blur sm:left-auto sm:right-6 sm:w-80 animate-slide-left">
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-xs font-bold text-white">App Update Available</p>
              <p className="mt-0.5 text-[10px] font-semibold text-violet-300">
                A new version of Anointed Worship is ready.
              </p>
            </div>
            <button
              onClick={handleUpdateReload}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-center font-mono text-[10px] font-bold text-white hover:bg-violet-500"
            >
              Refresh Now
            </button>
          </div>
          <button
            onClick={() => setHasUpdate(false)}
            className="self-start rounded-full p-1 text-violet-400 hover:bg-white/[0.04] hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
