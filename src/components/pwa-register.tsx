"use client";

import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, X } from "lucide-react";

const SERVICE_WORKER_READY_TIMEOUT_MS = 10_000;
const PENDING_PUSH_SAVE_SESSION_KEY = "anointed-worship:pending-push-save";

function hasPendingPushSave(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_PUSH_SAVE_SESSION_KEY) === "true";
  } catch {
    return true;
  }
}

function markPushSavePending() {
  try {
    window.sessionStorage.setItem(PENDING_PUSH_SAVE_SESSION_KEY, "true");
  } catch {
    // The current page remains retryable if storage is blocked.
  }
}

function clearPendingPushSave() {
  try {
    window.sessionStorage.removeItem(PENDING_PUSH_SAVE_SESSION_KEY);
  } catch {
    // A stale marker only causes another user-controlled retry prompt.
  }
}

function hasMatchingApplicationServerKey(
  subscription: PushSubscription,
  applicationServerKey: ArrayBuffer,
): boolean {
  const existingApplicationServerKey = subscription.options.applicationServerKey;
  if (!existingApplicationServerKey) return true;

  const existingKeyBytes = new Uint8Array(existingApplicationServerKey);
  const expectedKeyBytes = new Uint8Array(applicationServerKey);
  return (
    existingKeyBytes.length === expectedKeyBytes.length &&
    existingKeyBytes.every((byte, index) => byte === expectedKeyBytes[index])
  );
}

function decodeVapidPublicKey(encodedPublicKey: string | undefined): ArrayBuffer | null {
  if (!encodedPublicKey) return null;

  const base64Key = encodedPublicKey.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Key) || base64Key.length % 4 === 1) {
    return null;
  }

  const paddedBase64Key = base64Key.padEnd(Math.ceil(base64Key.length / 4) * 4, "=");

  try {
    const decodedKey = window.atob(paddedBase64Key);
    if (
      decodedKey.length !== 65 ||
      decodedKey.charCodeAt(0) !== 0x04 ||
      window.btoa(decodedKey) !== paddedBase64Key
    ) {
      return null;
    }

    const applicationServerKey = new ArrayBuffer(decodedKey.length);
    const keyBytes = new Uint8Array(applicationServerKey);
    for (let index = 0; index < decodedKey.length; index += 1) {
      keyBytes[index] = decodedKey.charCodeAt(index);
    }
    return applicationServerKey;
  } catch {
    return null;
  }
}

function waitForActiveServiceWorker(): Promise<ServiceWorkerRegistration> {
  const serviceWorkerReady = navigator.serviceWorker.ready;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("The service worker is not ready yet. Refresh the page and try again."));
    }, SERVICE_WORKER_READY_TIMEOUT_MS);

    serviceWorkerReady.then(
      (registration) => {
        window.clearTimeout(timeoutId);
        resolve(registration);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function getPushErrorMessage(error: unknown, isCreatingSubscription: boolean): string {
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  const errorName =
    error instanceof Error
      ? error.name
      : typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
        ? error.name
        : "";

  if (
    /push[_\s-]*service(?:[_\s-]*error)?/i.test(errorMessage) ||
    (isCreatingSubscription && errorName === "AbortError")
  ) {
    return "The browser could not register this device with its push service. Check your connection and try again.";
  }

  return errorMessage || "Notifications could not be enabled. Try again.";
}

export function PwaRegister({ enabled = true }: { enabled?: boolean }) {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [showStatusToast, setShowStatusToast] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const isEnablingPushRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registered with scope:", reg.scope);
          setSwRegistration(reg);

          const applicationServerKey = decodeVapidPublicKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
          if (
            applicationServerKey &&
            "Notification" in window &&
            "PushManager" in window &&
            Notification.permission === "default"
          ) {
            setShowPushPrompt(true);
          } else if (
            applicationServerKey &&
            "Notification" in window &&
            "PushManager" in window &&
            Notification.permission === "granted"
          ) {
            if (hasPendingPushSave()) {
              setShowPushPrompt(true);
            } else {
              void reg.pushManager.getSubscription().then((subscription) => {
                if (!subscription || !hasMatchingApplicationServerKey(subscription, applicationServerKey)) {
                  setShowPushPrompt(true);
                }
              }).catch(() => setShowPushPrompt(true));
            }
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
    if (isEnablingPushRef.current || !swRegistration) return;
    if (!window.isSecureContext) {
      setPushError("Notifications require a secure HTTPS connection or localhost.");
      return;
    }
    if (!("Notification" in window) || !("PushManager" in window)) return;

    isEnablingPushRef.current = true;
    setIsEnablingPush(true);
    setPushError(null);

    let isCreatingSubscription = false;
    try {
      const applicationServerKey = decodeVapidPublicKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
      if (!applicationServerKey) {
        throw new Error("Notifications are unavailable on this website. Contact your team administrator.");
      }

      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notifications are blocked. Allow them in your browser settings, then try again.");
      }

      const activeRegistration = await waitForActiveServiceWorker();
      let subscription = await activeRegistration.pushManager.getSubscription();

      if (subscription && !hasMatchingApplicationServerKey(subscription, applicationServerKey)) {
        const wasUnsubscribed = await subscription.unsubscribe();
        if (!wasUnsubscribed) {
          throw new Error("An old notification subscription could not be replaced. Try again.");
        }
        subscription = null;
      }

      if (!subscription) {
        isCreatingSubscription = true;
        subscription = await activeRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        isCreatingSubscription = false;
      }

      markPushSavePending();
      let response: Response;
      try {
        response = await fetch("/api/web-push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription }),
        });
      } catch {
        throw new Error("Could not reach the server to save this subscription. Check your connection and try again.");
      }

      if (!response.ok) {
        throw new Error("The server could not save this notification subscription. Try again.");
      }
      clearPendingPushSave();
      setShowPushPrompt(false);
    } catch (error) {
      setPushError(getPushErrorMessage(error, isCreatingSubscription));
    } finally {
      isEnablingPushRef.current = false;
      setIsEnablingPush(false);
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
                A new version of Sunday Setlist is ready.
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
            <button
              type="button"
              onClick={enablePushNotifications}
              disabled={isEnablingPush}
              aria-busy={isEnablingPush}
              className="min-h-9 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-70"
            >
              {isEnablingPush ? "Enabling..." : "Enable"}
            </button>
            <button
              type="button"
              onClick={() => setShowPushPrompt(false)}
              disabled={isEnablingPush}
              className="min-h-9 rounded-lg px-3 text-xs font-bold text-zinc-300 hover:bg-white/[0.06] disabled:opacity-70"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
