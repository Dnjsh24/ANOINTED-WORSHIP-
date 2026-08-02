"use client";

import { useEffect, useRef, useState } from "react";

export function PdfPageCanvas({
  url,
  pageNumber,
  className = "",
  label,
}: {
  url: string;
  pageNumber: number;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let destroyLoadingTask: (() => Promise<void>) | undefined;
    let cancelRenderTask: (() => void) | undefined;

    void (async () => {
      setError("");
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url,
          ).toString();
        }
        const task = pdfjs.getDocument({ url, isEvalSupported: false });
        destroyLoadingTask = () => task.destroy();
        const document = await task.promise;
        if (cancelled) return;
        const page = await document.getPage(pageNumber);
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context || cancelled) return;
        const containerWidth = canvas.parentElement?.clientWidth || 1280;
        const containerHeight = canvas.parentElement?.clientHeight || 720;
        const unitViewport = page.getViewport({ scale: 1 });
        const scale = Math.max(0.1, Math.min(containerWidth / unitViewport.width, containerHeight / unitViewport.height));
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const pageRenderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        cancelRenderTask = () => pageRenderTask.cancel();
        await pageRenderTask.promise;
        page.cleanup();
      } catch (cause) {
        if (!cancelled && !(cause instanceof Error && cause.name === "RenderingCancelledException")) {
          setError("PDF page unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelRenderTask?.();
      void destroyLoadingTask?.();
    };
  }, [pageNumber, url]);

  return (
    <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-black ${className}`} aria-label={label || `PDF page ${pageNumber}`}>
      <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
      {error && <p role="alert" className="absolute rounded bg-red-950/90 px-3 py-2 text-sm font-bold text-red-100">{error}</p>}
    </div>
  );
}
