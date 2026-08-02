"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Keyboard, Loader2, MonitorPlay, ShieldCheck, Smartphone, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  claimCloudRemotePairing,
  claimCloudRemotePairingByPin,
  type RemotePairingClaimResult,
} from "@/app/presenter/remote-pairing-actions";
import {
  normalizeRemotePairingPin,
  parseWorshipRemoteQrPayload,
} from "@/lib/presentation/remote-pairing";

const PENDING_PAIRING_KEY = "anointed-worship-pending-remote-pairing";
const PENDING_PIN_KEY = "anointed-worship-pending-remote-pin";

type PairingStatus = "idle" | "connecting" | "error";

export default function WorshipRemoteClient({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<PairingStatus>(initialError ? "error" : "idle");
  const [message, setMessage] = useState(initialError || "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const restoredPairingRef = useRef(false);

  const finishClaim = useCallback((result: RemotePairingClaimResult, pendingValue: string, kind: "pair" | "pin") => {
    if (result.ok) {
      window.sessionStorage.removeItem(PENDING_PAIRING_KEY);
      window.sessionStorage.removeItem(PENDING_PIN_KEY);
      router.replace(`/worship-remote/session/${encodeURIComponent(result.sessionId)}`);
      return;
    }

    if (result.code === "auth_required") {
      window.sessionStorage.setItem(kind === "pair" ? PENDING_PAIRING_KEY : PENDING_PIN_KEY, pendingValue);
      router.push("/login?next=%2Fworship-remote");
      return;
    }

    window.sessionStorage.removeItem(kind === "pair" ? PENDING_PAIRING_KEY : PENDING_PIN_KEY);
    setStatus("error");
    setMessage(result.message);
  }, [router]);

  const connectPair = useCallback(async (pair: string) => {
    setScannerOpen(false);
    setStatus("connecting");
    setMessage("Checking the secure pairing link…");
    try {
      finishClaim(await claimCloudRemotePairing(pair), pair, "pair");
    } catch {
      setStatus("error");
      setMessage("Worship Remote is temporarily unavailable. Try again.");
    }
  }, [finishClaim]);

  const connectPin = useCallback(async (pinCode: string) => {
    setStatus("connecting");
    setMessage("Connecting to the Windows Presenter…");
    try {
      finishClaim(await claimCloudRemotePairingByPin(pinCode), pinCode, "pin");
    } catch {
      setStatus("error");
      setMessage("Worship Remote is temporarily unavailable. Try again.");
    }
  }, [finishClaim]);

  useEffect(() => {
    if (restoredPairingRef.current) return;
    restoredPairingRef.current = true;

    const pairFromUrl = parseWorshipRemoteQrPayload(window.location.href, window.location.origin);
    const storedPair = window.sessionStorage.getItem(PENDING_PAIRING_KEY);
    const storedPin = window.sessionStorage.getItem(PENDING_PIN_KEY);
    if (window.location.hash) window.history.replaceState(null, "", "/worship-remote");

    const restoreTimer = window.setTimeout(() => {
      if (pairFromUrl || storedPair) {
        void connectPair(pairFromUrl || storedPair!);
        return;
      }
      if (storedPin) {
        const restoredPin = normalizeRemotePairingPin(storedPin);
        setPin(restoredPin);
        if (restoredPin.length === 6) void connectPin(restoredPin);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [connectPair, connectPin]);

  const submitPin = (event: React.FormEvent) => {
    event.preventDefault();
    if (pin.length !== 6 || status === "connecting") return;
    void connectPin(pin);
  };

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#0d0c12] px-5 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-24 size-[32rem] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="relative mx-auto w-full max-w-lg">
        <header className="mb-7 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/15">
            <Smartphone className="size-6 text-violet-200" aria-hidden="true" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-violet-300">Anointed Worship</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Worship Remote</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
            Connect this phone to the Windows Presenter and control lyrics, slides, displays, Bible verses, and stage tools.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-[#151419]/95 p-5 shadow-2xl sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200">
              <Keyboard className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-black">Enter the six-digit code</h2>
              <p className="text-xs text-zinc-500">The code appears after choosing Pair phone on the PC.</p>
            </div>
          </div>

          <form onSubmit={submitPin} className="mt-5">
            <label htmlFor="worship-remote-pin" className="sr-only">Six-digit pairing code</label>
            <input
              id="worship-remote-pin"
              value={pin}
              onChange={(event) => {
                setPin(normalizeRemotePairingPin(event.target.value));
                if (status === "error") {
                  setStatus("idle");
                  setMessage("");
                }
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000 000"
              aria-describedby="remote-pin-help"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-4 text-center font-mono text-3xl font-black tracking-[0.3em] text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
            />
            <p id="remote-pin-help" className="mt-2 text-center text-[11px] text-zinc-500">
              Pairing codes expire after 10 minutes and work only once.
            </p>
            <button
              type="submit"
              disabled={pin.length !== 6 || status === "connecting"}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "connecting" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MonitorPlay className="size-4" aria-hidden="true" />}
              Connect to Presenter
            </button>
          </form>

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={() => {
              setMessage("");
              setStatus("idle");
              setScannerOpen(true);
            }}
            disabled={status === "connecting"}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black transition hover:border-white/20 hover:bg-white/[0.09] disabled:opacity-40"
          >
            <Camera className="size-4" aria-hidden="true" />
            Scan QR Code
          </button>

          <p className="mt-3 text-center text-[11px] leading-5 text-zinc-500">
            If camera permission is denied or unavailable, enter the six-digit PIN instead. Your normal phone camera can also open the QR link directly.
          </p>

          {message && (
            <p
              role={status === "error" ? "alert" : "status"}
              className={`mt-4 rounded-lg border px-3 py-2 text-center text-xs font-semibold ${status === "error" ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-violet-400/20 bg-violet-500/10 text-violet-100"}`}
            >
              {message}
            </p>
          )}
        </section>

        <section className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4 text-xs leading-5 text-emerald-100/80">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden="true" />
            <p>Sign-in and an active membership in the same worship team are required. Controls unlock only while the paired Windows Presenter is online.</p>
          </div>
        </section>
      </div>

      {scannerOpen && (
        <QrScanner
          onClose={() => setScannerOpen(false)}
          onPair={(pair) => void connectPair(pair)}
        />
      )}
    </main>
  );
}

type NativeBarcode = { rawValue?: string };
type NativeBarcodeDetector = { detect: (source: HTMLVideoElement) => Promise<NativeBarcode[]> };
type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

function QrScanner({ onClose, onPair }: { onClose: () => void; onPair: (pair: string) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    focusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let animationFrame = 0;
    let stream: MediaStream | null = null;
    let scannerControls: { stop: () => void } | null = null;

    const stop = () => {
      stopped = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      scannerControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video.srcObject) video.srcObject = null;
    };

    const accept = (rawValue: string) => {
      const pair = parseWorshipRemoteQrPayload(rawValue, window.location.origin);
      if (!pair) {
        setError("That QR code is not an Anointed Worship Remote link.");
        return false;
      }
      stop();
      onPair(pair);
      return true;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera scanning is not available in this browser. Enter the PIN instead.");
        return;
      }

      try {
        const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          if (stopped) return;
          video.srcObject = stream;
          await video.play();
          const detector = new Detector({ formats: ["qr_code"] });
          const scan = async () => {
            if (stopped) return;
            try {
              const barcodes = await detector.detect(video);
              const rawValue = barcodes.find((barcode) => barcode.rawValue)?.rawValue;
              if (rawValue && accept(rawValue)) return;
            } catch {
              // A frame can be unreadable while the camera is moving; continue.
            }
            animationFrame = window.requestAnimationFrame(() => void scan());
          };
          animationFrame = window.requestAnimationFrame(() => void scan());
          return;
        }

        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (stopped) return;
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
        scannerControls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video,
          (result) => {
            const rawValue = result?.getText();
            if (rawValue) accept(rawValue);
          },
        );
      } catch (cameraError) {
        const name = cameraError instanceof DOMException ? cameraError.name : "";
        setError(name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access or enter the PIN instead."
          : "The camera could not start. Enter the PIN instead.");
      }
    };

    void start();
    return stop;
  }, [onPair]);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="qr-scanner-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17161b] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="qr-scanner-title" className="font-black">Scan the Presenter QR code</h2>
            <p className="mt-1 text-xs text-zinc-500">Point the camera at the code shown on the Windows PC.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close QR scanner" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="relative mt-4 aspect-square overflow-hidden rounded-xl border border-violet-400/30 bg-black">
          <video ref={videoRef} muted playsInline aria-label="QR scanner camera preview" className="size-full object-cover" />
          <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-violet-300/80 shadow-[0_0_0_999px_rgba(0,0,0,.28)]" />
        </div>
        {error ? <p role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p> : <p role="status" className="mt-3 text-center text-xs text-zinc-400">Starting the camera…</p>}
        <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] text-sm font-bold hover:bg-white/10">Use PIN instead</button>
      </section>
    </div>
  );
}
