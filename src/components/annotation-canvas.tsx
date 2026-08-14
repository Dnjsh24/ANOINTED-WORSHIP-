"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import {
  PenTool,
  Eraser,
  RotateCcw,
  Users,
  User,
  Save,
  Copy,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import {
  type SongAnnotation,
  getAnnotationStorageKey,
  buildCopiedAnnotation,
  buildMasterSongDefaultAnnotation,
} from "@/lib/domain/annotations";
import {
  saveSongAnnotationAction,
  copyAnnotationToSetlistAction,
  saveAnnotationToMasterSongAction,
} from "@/app/actions";
import { cn } from "@/lib/utils";

const STROKE_COLORS = [
  { name: "Yellow", value: "#facc15" },
  { name: "Red", value: "#ef4444" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#22c55e" },
  { name: "White", value: "#ffffff" },
] as const;

const STROKE_SIZES = [2, 4, 8, 12] as const;

interface AnnotationCanvasProps {
  songId: string;
  setlistId?: string;
  setlistSongId?: string;
  songTitle?: string;
  userId?: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function AnnotationCanvas({
  songId,
  setlistId,
  setlistSongId,
  songTitle,
  userId,
  containerRef,
}: AnnotationCanvasProps) {
  const [drawMode, setDrawMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penTool, setPenTool] = useState<"pen" | "eraser">("pen");
  const [penSize, setPenSize] = useState<number>(4);
  const [penColor, setPenColor] = useState("#facc15");

  const [isShared, setIsShared] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [targetSetlistIdInput, setTargetSetlistIdInput] = useState("");

  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const storageKey = getAnnotationStorageKey(songId, setlistId, setlistSongId, userId, isShared);

  // Derive initial textNotes during render without synchronous setState in useEffect
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  const [textNotes, setTextNotes] = useState<string>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed: SongAnnotation = JSON.parse(raw);
        return parsed.textNotes || "";
      }
    } catch {
      // ignore
    }
    return "";
  });

  if (prevStorageKey !== storageKey) {
    setPrevStorageKey(storageKey);
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed: SongAnnotation = JSON.parse(raw);
        setTextNotes(parsed.textNotes || "");
      } else {
        setTextNotes("");
      }
    } catch {
      setTextNotes("");
    }
  }

  // Synchronize canvas dimensions with chart scroll container
  const updateCanvasDimensions = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const scrollEl = containerRef.current;
    canvasRef.current.width = scrollEl.scrollWidth || 800;
    canvasRef.current.height = Math.max(scrollEl.scrollHeight || 600, 600);
  }, [containerRef]);

  // Load existing canvas drawing image from local storage (no state updates)
  useEffect(() => {
    if (!canvasRef.current) return;
    updateCanvasDimensions();
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: SongAnnotation = JSON.parse(raw);
        if (parsed.drawingDataUrl) {
          const img = new Image();
          img.onload = () => {
            if (canvasRef.current) {
              const currentCtx = canvasRef.current.getContext("2d");
              currentCtx?.drawImage(img, 0, 0);
            }
          };
          img.src = parsed.drawingDataUrl;
        }
      }
    } catch (err) {
      console.error("Failed to load stored annotation image:", err);
    }
  }, [storageKey, updateCanvasDimensions]);

  // Handle window resize to adjust canvas bounds
  useEffect(() => {
    window.addEventListener("resize", updateCanvasDimensions);
    return () => window.removeEventListener("resize", updateCanvasDimensions);
  }, [updateCanvasDimensions]);

  // Save current annotation state to localStorage and invoke server action
  const saveCurrentAnnotation = useCallback(() => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");

    const payload: SongAnnotation = {
      songId,
      setlistId,
      setlistSongId,
      userId,
      textNotes,
      drawingDataUrl: dataUrl,
      isShared,
      updatedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore localstorage errors
    }

    const formData = new FormData();
    formData.set("songId", songId);
    if (setlistId) formData.set("setlistId", setlistId);
    if (setlistSongId) formData.set("setlistSongId", setlistSongId);
    formData.set("textNotes", textNotes);
    formData.set("drawingDataUrl", dataUrl);
    formData.set("isShared", isShared ? "true" : "false");

    startTransition(async () => {
      await saveSongAnnotationAction(formData);
    });
  }, [songId, setlistId, setlistSongId, userId, textNotes, isShared, storageKey]);

  // Drawing event handlers
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    setIsDrawing(true);
    lastPosRef.current = getCanvasCoords(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawMode || !canvasRef.current || !lastPosRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const currentPos = getCanvasCoords(e);

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);

    if (penTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = penSize * 3;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    ctx.stroke();
    lastPosRef.current = currentPos;
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPosRef.current = null;
    saveCurrentAnnotation();
  };

  const handleClearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      saveCurrentAnnotation();
    }
  };

  const handleSaveAsMasterDefault = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");

    const masterPayload: SongAnnotation = buildMasterSongDefaultAnnotation(
      {
        songId,
        setlistId,
        setlistSongId,
        userId,
        textNotes,
        drawingDataUrl: dataUrl,
        isShared,
      },
      userId ?? undefined,
    );

    const masterKey = getAnnotationStorageKey(songId, null, null, userId, false);
    try {
      localStorage.setItem(masterKey, JSON.stringify(masterPayload));
    } catch {
      // ignore
    }

    const formData = new FormData();
    formData.set("songId", songId);
    formData.set("textNotes", textNotes);
    formData.set("drawingDataUrl", dataUrl);

    startTransition(async () => {
      const res = await saveAnnotationToMasterSongAction(formData);
      setStatusMessage(res.message || "Saved to Master Song Default");
      setTimeout(() => setStatusMessage(null), 3000);
    });
  };

  const handleCopyNotesToSetlist = () => {
    if (!targetSetlistIdInput || !canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");

    const targetSlotId = `slot-${targetSetlistIdInput}`;
    const copiedPayload = buildCopiedAnnotation(
      {
        songId,
        setlistId,
        setlistSongId,
        userId,
        textNotes,
        drawingDataUrl: dataUrl,
        isShared,
      },
      targetSetlistIdInput,
      targetSlotId,
      userId ?? undefined,
    );

    const targetKey = getAnnotationStorageKey(songId, targetSetlistIdInput, targetSlotId, userId, isShared);
    try {
      localStorage.setItem(targetKey, JSON.stringify(copiedPayload));
    } catch {
      // ignore
    }

    const formData = new FormData();
    formData.set("songId", songId);
    formData.set("targetSetlistId", targetSetlistIdInput);
    formData.set("targetSetlistSongId", targetSlotId);

    startTransition(async () => {
      const res = await copyAnnotationToSetlistAction(formData);
      setStatusMessage(res.message || "Copied notes to setlist");
      setShowCopyModal(false);
      setTimeout(() => setStatusMessage(null), 3000);
    });
  };

  return (
    <>
      {/* HTML5 Canvas Overlay */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className={cn(
          "absolute inset-0 z-10",
          drawMode ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
        )}
      />

      {/* Floating Toolbar Controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-md">
        {/* Toggle Draw Mode */}
        <button
          type="button"
          onClick={() => setDrawMode(!drawMode)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition min-h-[36px]",
            drawMode
              ? "bg-violet-600 text-white shadow-md"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
          )}
        >
          <PenTool className="size-3.5" />
          <span>{drawMode ? "Drawing ON" : "Draw"}</span>
        </button>

        {drawMode && (
          <>
            {/* Pen vs Eraser */}
            <div className="flex items-center gap-1 rounded-lg bg-zinc-800 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => setPenTool("pen")}
                className={cn(
                  "p-1 rounded text-xs font-bold transition",
                  penTool === "pen" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white",
                )}
                aria-label="Pen tool"
              >
                <PenTool className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPenTool("eraser")}
                className={cn(
                  "p-1 rounded text-xs font-bold transition",
                  penTool === "eraser" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white",
                )}
                aria-label="Eraser tool"
              >
                <Eraser className="size-3.5" />
              </button>
            </div>

            {/* Stroke Size Selector */}
            <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5 border border-white/10">
              {STROKE_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPenSize(size)}
                  className={cn(
                    "px-1.5 py-0.5 font-mono text-[10px] font-bold rounded transition",
                    penSize === size ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white",
                  )}
                >
                  {size}px
                </button>
              ))}
            </div>

            {/* Colors */}
            {penTool === "pen" && (
              <div className="flex items-center gap-1.5 px-1">
                {STROKE_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setPenColor(c.value)}
                    style={{ backgroundColor: c.value }}
                    className={cn(
                      "size-5 rounded-full border border-white/20 transition-transform",
                      penColor === c.value ? "scale-125 ring-2 ring-violet-400" : "hover:scale-110",
                    )}
                    aria-label={`Color ${c.name}`}
                  />
                ))}
              </div>
            )}

            {/* Clear Canvas */}
            <button
              type="button"
              onClick={handleClearCanvas}
              className="p-1.5 text-zinc-400 hover:text-red-400 rounded"
              title="Clear Drawing"
              aria-label="Clear Drawing"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </>
        )}

        <div className="h-4 w-px bg-white/10" />

        {/* Text Notes Drawer Toggle */}
        <button
          type="button"
          onClick={() => setShowNotesDrawer(!showNotesDrawer)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition min-h-[36px]",
            textNotes ? "bg-amber-950/80 text-amber-300 border border-amber-500/40" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
          )}
        >
          <StickyNote className="size-3.5" />
          <span>Notes {textNotes ? "•" : ""}</span>
          {showNotesDrawer ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
        </button>

        {/* Personal vs Team Shared Visibility Toggle */}
        <button
          type="button"
          onClick={() => {
            setIsShared(!isShared);
            saveCurrentAnnotation();
          }}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition border min-h-[36px]",
            isShared
              ? "border-emerald-500/40 bg-emerald-950/80 text-emerald-300"
              : "border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
          )}
          title={isShared ? "Visible to entire team on Stage" : "Private personal note"}
        >
          {isShared ? <Users className="size-3.5" /> : <User className="size-3.5" />}
          <span>{isShared ? "Team Shared" : "Personal"}</span>
        </button>

        {/* Actions Dropdown: Save as Master / Copy to Setlist */}
        <button
          type="button"
          onClick={handleSaveAsMasterDefault}
          disabled={isPending}
          className="p-1.5 text-zinc-400 hover:text-emerald-400 rounded"
          title="Save as Master Song Default"
          aria-label="Save as Master Song Default"
        >
          <Save className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setShowCopyModal(true)}
          className="p-1.5 text-zinc-400 hover:text-violet-400 rounded"
          title="Copy Notes to Another Setlist"
          aria-label="Copy Notes to Another Setlist"
        >
          <Copy className="size-3.5" />
        </button>

        {statusMessage && (
          <span className="text-[11px] font-semibold text-emerald-400 animate-fade-in pl-1">
            {statusMessage}
          </span>
        )}
      </div>

      {/* Expandable Text Notes Panel */}
      {showNotesDrawer && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-80 max-w-[90vw] rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-md animate-fade-up">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <StickyNote className="size-4" /> Musician Notes ({songTitle || "Active Song"})
            </span>
            <button
              type="button"
              onClick={() => setShowNotesDrawer(false)}
              className="text-zinc-400 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          <textarea
            value={textNotes}
            onChange={(e) => setTextNotes(e.target.value)}
            onBlur={saveCurrentAnnotation}
            placeholder="Type vocal cues, solo timings, or arrangement notes here..."
            rows={4}
            className="mt-2 w-full rounded-lg bg-zinc-950 p-2.5 text-xs text-zinc-100 placeholder-zinc-500 border border-white/10 focus:border-violet-500 focus:outline-none"
          />

          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] text-zinc-400">
              {isShared ? "Shared with team on Stage" : "Private to your account"}
            </span>
            <button
              type="button"
              onClick={saveCurrentAnnotation}
              className="flex items-center gap-1 rounded bg-violet-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-violet-500"
            >
              <Check className="size-3" /> Save Notes
            </button>
          </div>
        </div>
      )}

      {/* Copy Notes to Another Setlist Dialog Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Copy className="size-5 text-violet-400" />
              Copy Notes & Drawings
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Target setlist ID to copy current notes & drawings for <strong>{songTitle}</strong>:
            </p>

            <input
              type="text"
              value={targetSetlistIdInput}
              onChange={(e) => setTargetSetlistIdInput(e.target.value)}
              placeholder="Enter Target Setlist ID (e.g. youth-night)"
              className="mt-3 w-full rounded-lg bg-zinc-950 p-2.5 font-mono text-xs text-white border border-white/10 focus:border-violet-500 focus:outline-none"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCopyModal(false)}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCopyNotesToSetlist}
                disabled={!targetSetlistIdInput || isPending}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-40"
              >
                {isPending ? "Copying..." : "Copy to Setlist"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
