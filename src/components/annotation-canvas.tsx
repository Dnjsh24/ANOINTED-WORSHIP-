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
  Check,
  X,
  Lock,
  Share2,
  GripHorizontal,
  Minus,
  Maximize2,
} from "lucide-react";
import {
  type SongAnnotation,
  type OnScreenTextNote,
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
  { name: "Cyan", value: "#06b6d4" },
  { name: "Green", value: "#22c55e" },
  { name: "White", value: "#ffffff" },
  { name: "Purple", value: "#a855f7" },
] as const;

const STROKE_SIZES = [2, 4, 8, 12] as const;
const FONT_SIZES = [14, 18, 24, 32] as const;

const TEAM_ROLES = [
  { id: "lead_vocal", label: "Lead Vocalist & Singers", icon: "🎤" },
  { id: "keys", label: "Keys & Synthesizer", icon: "🎹" },
  { id: "guitar", label: "Acoustic & Electric Guitar", icon: "🎸" },
  { id: "bass", label: "Bassist", icon: "🎸" },
  { id: "drums", label: "Drums & Percussion", icon: "🥁" },
  { id: "sound", label: "Sound Tech & Media", icon: "🎛️" },
] as const;

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
  const [penTool, setPenTool] = useState<"pen" | "eraser" | "text">("pen");
  const [penSize, setPenSize] = useState<number>(4);
  const [penColor, setPenColor] = useState("#facc15");
  const [textSize, setTextSize] = useState<number>(18);

  const [isShared, setIsShared] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);

  const [showCopyModal, setShowCopyModal] = useState(false);
  const [targetSetlistIdInput, setTargetSetlistIdInput] = useState("");

  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const storageKey = getAnnotationStorageKey(songId, setlistId, setlistSongId, userId, isShared);

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

  const [screenNotes, setScreenNotes] = useState<OnScreenTextNote[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed: SongAnnotation = JSON.parse(raw);
        return parsed.screenNotes || [];
      }
    } catch {
      // ignore
    }
    return [];
  });

  if (prevStorageKey !== storageKey) {
    setPrevStorageKey(storageKey);
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed: SongAnnotation = JSON.parse(raw);
        setTextNotes(parsed.textNotes || "");
        setScreenNotes(parsed.screenNotes || []);
        setIsShared(Boolean(parsed.isShared));
        setSelectedRoles(parsed.shareTargets || []);
      } else {
        setTextNotes("");
        setScreenNotes([]);
      }
    } catch {
      setTextNotes("");
      setScreenNotes([]);
    }
  }

  // Synchronize canvas dimensions with chart scroll container
  const updateCanvasDimensions = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const scrollEl = containerRef.current;
    canvasRef.current.width = scrollEl.scrollWidth || 800;
    canvasRef.current.height = Math.max(scrollEl.scrollHeight || 600, 600);
  }, [containerRef]);

  // Load existing canvas drawing image from local storage
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
  const saveCurrentAnnotation = useCallback(
    (notesOverride?: OnScreenTextNote[], sharedOverride?: boolean, rolesOverride?: string[]) => {
      if (!canvasRef.current) return;
      const dataUrl = canvasRef.current.toDataURL("image/png");

      const activeScreenNotes = notesOverride ?? screenNotes;
      const activeIsShared = sharedOverride ?? isShared;
      const activeRoles = rolesOverride ?? selectedRoles;

      const payload: SongAnnotation = {
        songId,
        setlistId,
        setlistSongId,
        userId,
        textNotes,
        screenNotes: activeScreenNotes,
        drawingDataUrl: dataUrl,
        isShared: activeIsShared,
        shareTargets: activeRoles,
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
      formData.set("isShared", activeIsShared ? "true" : "false");
      formData.set("shareTargets", JSON.stringify(activeRoles));

      startTransition(async () => {
        await saveSongAnnotationAction(formData);
      });
    },
    [songId, setlistId, setlistSongId, userId, textNotes, screenNotes, isShared, selectedRoles, storageKey],
  );

  // Drawing & On-screen text note creation handlers
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

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode || penTool !== "text") return;
    const coords = getCanvasCoords(e);

    const newNote: OnScreenTextNote = {
      id: `screen-note-${Date.now()}`,
      x: Math.round(coords.x),
      y: Math.round(coords.y),
      width: 220,
      height: 110,
      text: "",
      fontSize: textSize,
      color: penColor,
      isMinimized: false,
    };

    const updated = [...screenNotes, newNote];
    setScreenNotes(updated);
    saveCurrentAnnotation(updated);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawMode || penTool === "text") return;
    setIsDrawing(true);
    lastPosRef.current = getCanvasCoords(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawMode || penTool === "text" || !canvasRef.current || !lastPosRef.current) return;
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
      setScreenNotes([]);
      saveCurrentAnnotation([]);
    }
  };

  const handleUpdateScreenNote = (id: string, updates: Partial<OnScreenTextNote>) => {
    const updated = screenNotes.map((n) => (n.id === id ? { ...n, ...updates } : n));
    setScreenNotes(updated);
    saveCurrentAnnotation(updated);
  };

  const handleDeleteScreenNote = (id: string) => {
    const updated = screenNotes.filter((n) => n.id !== id);
    setScreenNotes(updated);
    saveCurrentAnnotation(updated);
  };

  // Draggable screen note positioning
  const handleNotePointerDown = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, textarea, select")) return;
    const targetNote = screenNotes.find((n) => n.id === id);
    if (!targetNote) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = targetNote.x;
    const origY = targetNote.y;

    const handlePointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      const nextX = Math.max(0, origX + dx);
      const nextY = Math.max(0, origY + dy);
      setScreenNotes((prev) => prev.map((n) => (n.id === id ? { ...n, x: nextX, y: nextY } : n)));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      saveCurrentAnnotation();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
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
        screenNotes,
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
        screenNotes,
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

  const toggleRoleSelection = (roleId: string) => {
    let nextRoles: string[];
    if (roleId === "all") {
      nextRoles = selectedRoles.includes("all") ? [] : ["all"];
    } else {
      const filtered = selectedRoles.filter((r) => r !== "all");
      nextRoles = filtered.includes(roleId) ? filtered.filter((r) => r !== roleId) : [...filtered, roleId];
    }
    setSelectedRoles(nextRoles);
  };

  const handleApplySharingSettings = () => {
    const nextIsShared = selectedRoles.length > 0;
    setIsShared(nextIsShared);
    saveCurrentAnnotation(undefined, nextIsShared, selectedRoles);
    setShowShareModal(false);
  };

  const handleToggleNotesMode = () => {
    if (penTool === "text" && drawMode) {
      setDrawMode(false);
    } else {
      setPenTool("text");
      setDrawMode(true);
    }
  };

  return (
    <>
      {/* HTML5 Canvas Overlay */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className={cn(
          "absolute inset-0",
          drawMode
            ? "z-30 pointer-events-auto touch-none " + (penTool === "text" ? "cursor-text" : "cursor-crosshair")
            : "z-10 pointer-events-none",
        )}
      />

      {/* Render Draggable, Resizable, Minimizable Floating On-Screen Text Note Boxes */}
      <div className="absolute inset-0 z-30 pointer-events-none overflow-visible">
        {screenNotes.map((note, index) => {
          if (note.isMinimized) {
            return (
              <div
                key={note.id}
                style={{
                  left: `${note.x}px`,
                  top: `${note.y}px`,
                }}
                className="absolute pointer-events-auto flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-zinc-950/95 px-3 py-1 shadow-2xl backdrop-blur-md transition-all cursor-grab active:cursor-grabbing select-none"
                onPointerDown={(e) => handleNotePointerDown(note.id, e)}
              >
                <GripHorizontal className="size-3 text-zinc-400" />
                <StickyNote className="size-3.5 text-amber-400 shrink-0" />
                <span
                  style={{ color: note.color, fontSize: "12px" }}
                  className="font-bold max-w-[120px] truncate"
                >
                  {note.text || `Note ${index + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => handleUpdateScreenNote(note.id, { isMinimized: false })}
                  className="p-0.5 text-zinc-400 hover:text-white rounded"
                  title="Expand Note"
                >
                  <Maximize2 className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteScreenNote(note.id)}
                  className="p-0.5 text-zinc-400 hover:text-red-400 rounded"
                  title="Delete Note"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          }

          return (
            <div
              key={note.id}
              style={{
                left: `${note.x}px`,
                top: `${note.y}px`,
                width: note.width ? `${note.width}px` : "240px",
                minHeight: note.height ? `${note.height}px` : "120px",
              }}
              className="absolute pointer-events-auto flex flex-col rounded-xl border border-amber-500/30 bg-zinc-950/95 p-2.5 shadow-2xl backdrop-blur-md transition-shadow resize overflow-auto min-w-[180px] min-h-[100px] select-none"
            >
              {/* Note Header Drag Handle */}
              <div
                onPointerDown={(e) => handleNotePointerDown(note.id, e)}
                className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-1.5 cursor-grab active:cursor-grabbing bg-zinc-900/60 -mx-2.5 -mt-2.5 px-2.5 pt-2 rounded-t-xl"
              >
                <div className="flex items-center gap-1.5">
                  <GripHorizontal className="size-3.5 text-zinc-400 shrink-0" />
                  <StickyNote className="size-3 text-amber-400 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    On-Screen Note
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleUpdateScreenNote(note.id, { isMinimized: true })}
                    className="p-0.5 text-zinc-400 hover:text-white rounded"
                    title="Minimize Note"
                  >
                    <Minus className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteScreenNote(note.id)}
                    className="p-0.5 text-zinc-400 hover:text-red-400 rounded"
                    title="Delete Note"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>

              {/* Text Note Area */}
              <textarea
                value={note.text}
                onChange={(e) => handleUpdateScreenNote(note.id, { text: e.target.value })}
                style={{
                  fontSize: `${note.fontSize}px`,
                  color: note.color,
                }}
                placeholder="Type note on screen..."
                rows={3}
                className="w-full flex-1 bg-transparent font-bold focus:outline-none placeholder-zinc-600 resize-none select-text"
              />

              {/* Inline Font Size & Color Controls */}
              <div className="flex items-center justify-between pt-1.5 border-t border-white/10 mt-1 text-[10px]">
                <div className="flex items-center gap-1">
                  {FONT_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => handleUpdateScreenNote(note.id, { fontSize: sz })}
                      className={cn(
                        "px-1 font-mono rounded transition",
                        note.fontSize === sz ? "bg-amber-500 text-black font-extrabold" : "text-zinc-400 hover:text-white",
                      )}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {STROKE_COLORS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => handleUpdateScreenNote(note.id, { color: c.value })}
                      style={{ backgroundColor: c.value }}
                      className={cn(
                        "size-3.5 rounded-full border border-white/20 transition-transform",
                        note.color === c.value ? "scale-125 ring-1 ring-white" : "hover:scale-110",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Toolbar Controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-md">
        {/* Toggle Freehand Draw Mode */}
        <button
          type="button"
          onClick={() => {
            if (penTool !== "pen") setPenTool("pen");
            setDrawMode(!drawMode || penTool !== "pen");
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition min-h-[36px]",
            drawMode && penTool === "pen"
              ? "bg-violet-600 text-white shadow-md"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
          )}
        >
          <PenTool className="size-3.5" />
          <span>{drawMode && penTool === "pen" ? "Drawing ON" : "Draw"}</span>
        </button>

        {/* Toggle On-Screen Notes Mode */}
        <button
          type="button"
          onClick={handleToggleNotesMode}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition min-h-[36px]",
            drawMode && penTool === "text"
              ? "bg-amber-600 text-white shadow-md border border-amber-400/50"
              : screenNotes.length > 0
                ? "bg-amber-950/80 text-amber-300 border border-amber-500/40"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
          )}
        >
          <StickyNote className="size-3.5" />
          <span>
            {drawMode && penTool === "text"
              ? "Notes Mode ON"
              : `Notes (${screenNotes.length})`}
          </span>
        </button>

        {drawMode && (
          <>
            {/* Eraser Tool */}
            <button
              type="button"
              onClick={() => setPenTool("eraser")}
              className={cn(
                "p-1.5 rounded text-xs font-bold transition flex items-center gap-1 border border-white/10",
                penTool === "eraser" ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white",
              )}
              aria-label="Eraser tool"
              title="Eraser"
            >
              <Eraser className="size-3.5" />
            </button>

            {/* Stroke Size / Font Size Selector */}
            {penTool === "text" ? (
              <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5 border border-white/10">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setTextSize(size)}
                    className={cn(
                      "px-1.5 py-0.5 font-mono text-[10px] font-bold rounded transition",
                      textSize === size ? "bg-amber-600 text-white" : "text-zinc-400 hover:text-white",
                    )}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            ) : (
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
            )}

            {/* Colors for Pen & Text */}
            {penTool !== "eraser" && (
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

            {/* Clear Canvas & Notes */}
            <button
              type="button"
              onClick={handleClearCanvas}
              className="p-1.5 text-zinc-400 hover:text-red-400 rounded"
              title="Clear Drawing & Screen Notes"
              aria-label="Clear Drawing"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </>
        )}

        <div className="h-4 w-px bg-white/10" />

        {/* Personal vs Team / Role Sharing Selector */}
        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition border min-h-[36px]",
            isShared
              ? "border-emerald-500/40 bg-emerald-950/80 text-emerald-300"
              : "border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
          )}
          title="Configure notes & drawing sharing options"
        >
          {isShared ? <Users className="size-3.5" /> : <User className="size-3.5" />}
          <span>
            {isShared
              ? selectedRoles.includes("all") || selectedRoles.length === 0
                ? "Team Shared"
                : `Shared (${selectedRoles.length})`
              : "Personal"}
          </span>
          <ChevronDown className="size-3" />
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

      {/* Share & Target Recipient Dialog Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Share2 className="size-5 text-violet-400" />
                Share Notes & Drawings
              </h3>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-zinc-400">
              Choose who can see your annotations and notes for <strong>{songTitle || "Active Song"}</strong>:
            </p>

            <div className="mt-4 space-y-2">
              {/* Option 1: Personal Only */}
              <button
                type="button"
                onClick={() => {
                  setSelectedRoles([]);
                }}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border text-left transition",
                  selectedRoles.length === 0
                    ? "border-violet-500 bg-violet-950/40 text-white"
                    : "border-white/10 bg-zinc-950 text-zinc-300 hover:bg-zinc-800",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Lock className="size-4 text-amber-400" />
                  <div>
                    <div className="text-xs font-bold">🔒 Personal (Only Me)</div>
                    <div className="text-[10px] text-zinc-400">Notes remain private to your device</div>
                  </div>
                </div>
                {selectedRoles.length === 0 && <Check className="size-4 text-violet-400" />}
              </button>

              {/* Option 2: Entire Team */}
              <button
                type="button"
                onClick={() => toggleRoleSelection("all")}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border text-left transition",
                  selectedRoles.includes("all")
                    ? "border-emerald-500 bg-emerald-950/40 text-white"
                    : "border-white/10 bg-zinc-950 text-zinc-300 hover:bg-zinc-800",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="size-4 text-emerald-400" />
                  <div>
                    <div className="text-xs font-bold">👥 Entire Team on Stage & Practice</div>
                    <div className="text-[10px] text-zinc-400">Visible to all worship team members</div>
                  </div>
                </div>
                {selectedRoles.includes("all") && <Check className="size-4 text-emerald-400" />}
              </button>

              {/* Option 3: Specific Roles */}
              <div className="pt-2">
                <div className="text-xs font-bold text-zinc-300 mb-2">👤 Or Select Specific Team Members / Roles:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TEAM_ROLES.map((role) => {
                    const isSelected = selectedRoles.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleRoleSelection(role.id)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border text-xs font-semibold text-left transition",
                          isSelected
                            ? "border-violet-500 bg-violet-950/40 text-violet-200"
                            : "border-white/10 bg-zinc-950 text-zinc-400 hover:bg-zinc-800",
                        )}
                      >
                        <span>{role.icon}</span>
                        <span className="truncate flex-1">{role.label}</span>
                        {isSelected && <Check className="size-3.5 text-violet-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplySharingSettings}
                className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-violet-500"
              >
                Save Sharing Settings
              </button>
            </div>
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
