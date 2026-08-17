"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, X } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PwaRegister({ enabled = true }: { enabled?: boolean }) {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [showStatusToast, setShowStatusToast] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registered with scope:", reg.scope);
          setSwRegistration(reg);

          if ("Notification" in window && "PushManager" in window &&
              Notification.permission === "default" && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
            setShowPushPrompt(true);
          }

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

    // 2. Connection listeners
    function handleOnline() {
      setIsOnline(true);
      setShowStatusToast(true);
      setTimeout(() => setShowStatusToast(false), 5000);
      
    }

    function handleOffline() {
      setIsOnline(false);
      setShowStatusToast(true);
      
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled]);

  if (!enabled) return null;

  async function enablePushNotifications() {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      setPushError("Notifications require a secure HTTPS connection or localhost.");
      return;
    }
    if (!swRegistration || !("Notification" in window) || !("PushManager" in window)) {
      setPushError("Push notifications are not supported on this browser.");
      return;
    }
    setPushError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushError(
          "Notifications are blocked. Click the lock or tune icon in your address bar to set Notifications to Allow.",
        );
        return;
      }
      const rawVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!rawVapidKey) {
        setPushError("Notification server key is not configured.");
        return;
      }
      const applicationServerKey = urlBase64ToUint8Array(rawVapidKey);
      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const response = await fetch("/api/web-push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      if (!response.ok) throw new Error("The server could not save this notification subscription.");
      setShowPushPrompt(false);
    } catch (error) {
      setPushError(
        error instanceof Error
          ? error.message
          : "Notifications could not be enabled. Please check your browser permissions.",
      );
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
        <div role="status" aria-live="polite" className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between rounded-xl border border-white/10 bg-[#111014]/95 p-4 shadow-2xl backdrop-blur sm:left-auto sm:right-6 sm:w-80 animate-slide-left">
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
                {isOnline ? "Internet access restored. Data will sync when the server responds." : "Some online features are unavailable until you reconnect."}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowStatusToast(false)}
            aria-label="Dismiss connection status"
            className="flex size-6 items-center justify-center rounded-full text-zinc-500 hover:bg-white/[0.04] hover:text-white"
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
            aria-label="Dismiss update notice"
            className="flex size-6 items-center justify-center self-start rounded-full text-violet-400 hover:bg-white/[0.04] hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {showPushPrompt && (
        <div className="fixed bottom-20 left-4 right-4 z-50 rounded-xl border border-violet-500/20 bg-[#111014]/95 p-4 shadow-2xl backdrop-blur sm:left-auto sm:right-6 sm:w-80">
          <p className="text-xs font-bold text-white">Enable ministry notifications?</p>
          <p className="mt-1 text-[11px] text-zinc-300">Get team and schedule updates on this device.</p>
          {pushError && <p role="alert" className="mt-2 text-xs text-red-300">{pushError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={enablePushNotifications} className="min-h-9 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-500">
              Enable
            </button>
            <button type="button" onClick={() => setShowPushPrompt(false)} className="min-h-9 rounded-lg px-3 text-xs font-bold text-zinc-300 hover:bg-white/[0.06]">
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
