"use client";

import { useEffect, useState } from "react";
import { Download, Info, Share, Smartphone } from "lucide-react";

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // 1. Detect if already installed (standalone mode)
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstalled(true);
    }

    // 2. Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setIsIOS(true);
    }

    // 3. Listen to beforeinstallprompt event
    function handleInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    // 4. Listen to appinstalled event
    function handleAppInstalled() {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log("[PWA] App successfully installed!");
    }

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;

    // Show native install prompt
    deferredPrompt.prompt();

    // Wait for response
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Install prompt outcome: ${outcome}`);

    if (outcome === "accepted") {
      setIsInstalled(true);
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  }

  if (isInstalled) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-left animate-fade-in mt-6">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Smartphone className="size-4.5 text-emerald-400" />
          App Installed Successfully
        </h3>
        <p className="mt-1 text-xs font-semibold text-zinc-400">
          Anointed Worship is running directly on your device. You can launch it from your home screen icon.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 text-left animate-fade-in mt-6">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Smartphone className="size-4.5 text-violet-400" />
        Get the App on Your Phone
      </h3>
      <p className="mt-1 text-xs font-semibold text-zinc-400">
        Run Anointed Worship in fullscreen standalone mode and access chord charts offline.
      </p>

      {isInstallable ? (
        <button
          onClick={handleInstallClick}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-xs font-bold text-white transition-all hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] active:scale-[0.98]"
        >
          <Download className="size-4" />
          Install Web App
        </button>
      ) : (
        <div className="mt-4 border-t border-white/[0.06] pt-4 space-y-3">
          <div className="flex gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
              <Info className="size-3.5" />
            </span>
            <div>
              <p className="text-[11px] font-bold text-zinc-300">Manual Install Required</p>
              <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">
                Your browser doesn't support automatic installation. Follow the steps below:
              </p>
            </div>
          </div>

          {isIOS ? (
            <div className="rounded-lg bg-white/[0.02] p-3 text-[11px] font-semibold text-zinc-400 space-y-2">
              <p className="flex items-center gap-1.5 text-zinc-300">
                <Share className="size-3.5 text-violet-400" />
                iOS Safari Instructions:
              </p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Make sure you are browsing in **Safari**.</li>
                <li>Tap the **Share** button (box with up arrow).</li>
                <li>Scroll down and select **Add to Home Screen**.</li>
              </ol>
            </div>
          ) : (
            <div className="rounded-lg bg-white/[0.02] p-3 text-[11px] font-semibold text-zinc-400 space-y-2">
              <p className="flex items-center gap-1.5 text-zinc-300">
                <Smartphone className="size-3.5 text-violet-400" />
                Chrome / Firefox Instructions:
              </p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Tap the **3-dots menu** at the top right of your browser.</li>
                <li>Select **Add to Home screen** or **Install app**.</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
