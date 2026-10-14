"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { PenLine, Eraser, Type, Bold, Italic, Underline, Strikethrough, Trash2, Check } from "lucide-react";
import { annotationColors, chartAnnotationKeys, noteFonts, parseChartNotes, type ChartNote } from "@/lib/domain/chart-annotations";

type Props = {
  setlistId: string;
  slotId: string;
  songId?: string;
  editable: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
};
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const controlClass = "min-h-11 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300";
const iconClass = "flex size-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40 aria-pressed:bg-white/10 aria-pressed:text-white";

function AnnotationColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
    {annotationColors.map(color => <button key={color.value} type="button" title={color.name} aria-label={`${label}: ${color.name}`} aria-pressed={value.toLowerCase() === color.value} onClick={() => onChange(color.value)} className="flex size-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
      <span className={`size-5 rounded-full border border-white/20 ${value.toLowerCase() === color.value ? "ring-2 ring-white/80 ring-offset-4 ring-offset-zinc-900" : ""}`} style={{ backgroundColor: color.value }} />
    </button>)}
    <label className="relative flex size-11 cursor-pointer items-center justify-center rounded-lg border border-white/10" title={`Custom ${label.toLowerCase()}`}>
      <span className="size-5 rounded-full border border-white/30" style={{ background: "conic-gradient(#fb7185, #facc15, #6ee7b7, #38bdf8, #c4b5fd, #fb7185)" }} />
      <input aria-label={`Custom ${label.toLowerCase()}`} type="color" value={value} onChange={event => onChange(event.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0 focus-visible:opacity-100" />
    </label>
  </div>;
}

export function ChartAnnotations(props: Props) {
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  return hydrated ? <LoadedAnnotations key={`${props.setlistId}:${props.slotId}`} {...props} /> : null;
}

function LoadedAnnotations({ setlistId, slotId, songId, editable, containerRef, contentRef }: Props) {
  const keys = chartAnnotationKeys(setlistId, slotId, songId);
  const [notes, setNotes] = useState(() => {
    try { return parseChartNotes(localStorage.getItem(keys.notes)); } catch { return []; }
  });
  const [selectedId, setSelectedId] = useState<string>();
  const [tool, setTool] = useState<"pen" | "eraser" | null>(null);
  const [penSize, setPenSize] = useState(4);
  const [penColor, setPenColor] = useState<string>("#facc15");
  const [saveError, setSaveError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const drag = useRef<{ id: string; x: number; y: number; clientX: number; clientY: number } | null>(null);
  const selectedNote = notes.find(note => note.id === selectedId);
  const focusDock = useCallback((selectedTool: "pen" | "eraser" | "text") => {
    const preferred = dockRef.current?.querySelector<HTMLButtonElement>(`[data-annotation-tool="${selectedTool}"]:not(:disabled)`);
    (preferred ?? dockRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
  }, []);

  useEffect(() => {
    if (!tool && !selectedId) return;
    const closeSettings = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      if (document.activeElement?.closest("[data-chart-annotation]")) {
        focusDock(tool ?? "text");
      }
      setTool(null);
      setSelectedId(undefined);
    };
    window.addEventListener("keydown", closeSettings);
    return () => window.removeEventListener("keydown", closeSettings);
  }, [tool, selectedId, focusDock]);

  const persist = useCallback((key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
      setSaveError("");
    } catch {
      setSaveError("Could not save annotations on this device. Keep this page open and free some browser storage before trying again.");
    }
  }, []);

  function saveNotes(next: ChartNote[]) {
    setNotes(next);
    persist(keys.notes, JSON.stringify(next));
  }
  function updateNote(id: string, updates: Partial<ChartNote>) {
    saveNotes(notes.map(note => note.id === id ? { ...note, ...updates } : note));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const content = contentRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !container || !content || !context) return;
    let cancelled = false;
    let edited = false;
    let loadGeneration = 0;
    function resize() {
      if (!canvas || !container || !content || !context) return;
      // Keep the full drawing when a smaller viewport or font clips its visible area.
      const width = Math.max(canvas.width, container.clientWidth);
      const height = Math.max(canvas.height, container.clientHeight, content.offsetTop + content.scrollHeight + 256);
      if (canvas.width === width && canvas.height === height) return;
      const previous = document.createElement("canvas");
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.getContext("2d")?.drawImage(canvas, 0, 0);
      canvas.width = width;
      canvas.height = height;
      context.drawImage(previous, 0, 0);
    }
    resize();
    function loadDrawing() {
      const generation = ++loadGeneration;
      try {
        const saved = localStorage.getItem(keys.drawing) ?? (keys.legacyDrawing ? localStorage.getItem(keys.legacyDrawing) : null);
        context!.clearRect(0, 0, canvas!.width, canvas!.height);
        if (!saved?.startsWith("data:image/png;base64,")) return;
        const image = new Image();
        image.onload = () => {
          if (cancelled || edited || generation !== loadGeneration) return;
          canvas!.width = Math.max(canvas!.width, image.width);
          canvas!.height = Math.max(canvas!.height, image.height);
          context!.drawImage(image, 0, 0);
        };
        image.src = saved;
      } catch { /* Reading unavailable storage leaves the chart usable. */ }
    }
    loadDrawing();
    const markEdited = () => { edited = true; };
    canvas.addEventListener("pointerdown", markEdited);
    const onStorage = (event: StorageEvent) => {
      if (event.key === keys.notes) setNotes(parseChartNotes(event.newValue));
      if (event.key === keys.drawing) { edited = false; loadDrawing(); }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    observer.observe(content);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      observer.disconnect();
      canvas.removeEventListener("pointerdown", markEdited);
      window.removeEventListener("storage", onStorage);
    };
  }, [keys.drawing, keys.legacyDrawing, keys.notes, containerRef, contentRef]);

  function addNote() {
    if (notes.length >= 100) return;
    const note: ChartNote = {
      id: crypto.randomUUID(), text: "", x: 24, y: (containerRef.current?.scrollTop ?? 0) + 100,
      font: "sans", fontSize: 24, color: "#facc15", bold: false, italic: false, underline: false, strike: false,
    };
    setTool(null);
    setSelectedId(note.id);
    saveNotes([...notes, note]);
  }

  function stopDrawing() {
    if (!drawing.current) return;
    drawing.current = false;
    if (canvasRef.current) persist(keys.drawing, canvasRef.current.toDataURL());
  }

  return <>
    {editable && <div data-chart-annotation className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[55] -translate-x-1/2" aria-label="Practice annotations" role="group">
      {(tool || selectedNote || saveError) && <div role={tool || selectedNote ? "dialog" : undefined} aria-label={tool || selectedNote ? "Annotation settings" : undefined} className="absolute bottom-full left-1/2 mb-3 max-h-[55dvh] -translate-x-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-xl" style={{ width: "min(34rem, calc(100vw - 2rem))" }}>
      {tool && <div className="flex items-center gap-3 px-1 text-xs text-zinc-300">
        <span>{tool === "pen" ? "Pen" : "Eraser"}</span>
        <input aria-label="Pen size" className="h-11 min-w-0 flex-1 accent-zinc-200" type="range" min="2" max="50" value={penSize} onChange={event => setPenSize(Number(event.target.value))} />
        <span className="w-8 text-right tabular-nums">{penSize}px</span>
      </div>}
      {tool === "pen" && <AnnotationColorPicker label="Pen color" value={penColor} onChange={setPenColor} />}
      {tool && <p className="mt-2 px-1 text-xs text-zinc-400">Tap the active tool to scroll again.</p>}
      {saveError && <p role="alert" className="text-sm text-amber-200">{saveError}</p>}
      {selectedNote && <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-zinc-300">Font <select aria-label="Note font" className={controlClass} value={selectedNote.font} onChange={event => updateNote(selectedNote.id, { font: event.target.value as ChartNote["font"] })}>
          <option value="sans">Arial</option><option value="serif">Georgia</option><option value="mono">Monospace</option>
        </select></label>
        <label className="text-xs text-zinc-300">Size <select aria-label="Note font size" className={controlClass} value={selectedNote.fontSize} onChange={event => updateNote(selectedNote.id, { fontSize: Number(event.target.value) })}>
          {[12, 16, 18, 24, 32, 48, 64, 72].map(size => <option key={size} value={size}>{size}px</option>)}
        </select></label>
        </div>
        <div className="flex flex-wrap items-center gap-1">
        {([['bold', 'Bold', Bold], ['italic', 'Italic', Italic], ['underline', 'Underline', Underline], ['strike', 'Strikethrough', Strikethrough]] as const).map(([property, label, Icon]) => <button type="button" key={property} title={label} aria-label={label} className={iconClass} aria-pressed={selectedNote[property]} onClick={() => updateNote(selectedNote.id, { [property]: !selectedNote[property] })}><Icon className="size-4" aria-hidden="true" /></button>)}
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button type="button" title="Delete note" aria-label="Delete note" className={iconClass} onClick={() => { saveNotes(notes.filter(note => note.id !== selectedNote.id)); setSelectedId(undefined); focusDock("text"); }}><Trash2 className="size-4" aria-hidden="true" /></button>
        <button type="button" title="Done editing" aria-label="Done editing" className={iconClass} onClick={() => { setSelectedId(undefined); focusDock("text"); }}><Check className="size-4" aria-hidden="true" /></button>
        </div>
        <AnnotationColorPicker label="Text color" value={selectedNote.color} onChange={color => updateNote(selectedNote.id, { color })} />
      </div>}
      </div>}
      <div ref={dockRef} className="flex items-center gap-1 rounded-2xl border border-white/10 bg-zinc-900/90 p-1.5 shadow-xl backdrop-blur-xl">
        <button data-annotation-tool="pen" type="button" className={iconClass} title="Pen" aria-label="Apple Pencil Annotations" aria-pressed={tool === "pen"} onClick={() => { setSelectedId(undefined); setTool(tool === "pen" ? null : "pen"); }}><PenLine className="size-5" aria-hidden="true" /></button>
        <button data-annotation-tool="eraser" type="button" className={iconClass} title="Eraser" aria-label="Eraser" aria-pressed={tool === "eraser"} onClick={() => { setSelectedId(undefined); setTool(tool === "eraser" ? null : "eraser"); }}><Eraser className="size-5" aria-hidden="true" /></button>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button data-annotation-tool="text" type="button" className={iconClass} title="Add text note" aria-label="Add text note" aria-pressed={Boolean(selectedNote)} disabled={notes.length >= 100} onClick={addNote}><Type className="size-5" aria-hidden="true" /></button>
      </div>
    </div>}
    <canvas ref={canvasRef} data-chart-annotation aria-label="Saved chart drawing" className={`absolute left-0 top-0 z-20 ${editable && tool ? "cursor-crosshair" : "pointer-events-none"}`} style={{ touchAction: tool ? "none" : "auto" }}
      onPointerDown={event => {
        if (!editable || !tool || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        const context = event.currentTarget.getContext("2d");
        const rect = event.currentTarget.getBoundingClientRect();
        context?.beginPath();
        context?.moveTo(event.clientX - rect.left, event.clientY - rect.top);
      }}
      onPointerMove={event => {
        if (!editable || !tool || !drawing.current) return;
        const context = event.currentTarget.getContext("2d");
        if (!context) return;
        const rect = event.currentTarget.getBoundingClientRect();
        context.lineTo(event.clientX - rect.left, event.clientY - rect.top);
        context.strokeStyle = penColor;
        context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
        context.lineWidth = tool === "eraser" ? penSize * 4 : penSize;
        context.lineCap = "round";
        context.stroke();
      }} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} onLostPointerCapture={stopDrawing} />
    {notes.map((note, index) => {
      const selected = editable && selectedId === note.id;
      const style: CSSProperties = {
        left: `clamp(0px, ${note.x}px, calc(100% - 80px))`, top: note.y, fontFamily: noteFonts[note.font], fontSize: note.fontSize,
        color: note.color,
        fontWeight: note.bold ? "bold" : "normal", fontStyle: note.italic ? "italic" : "normal",
        textDecoration: [note.underline && "underline", note.strike && "line-through"].filter(Boolean).join(" "),
        maxWidth: `max(80px, calc(100% - ${note.x}px))`,
      };
      return <div key={note.id} data-chart-annotation className={`absolute z-30 w-64 whitespace-pre-wrap break-words rounded ${editable ? "border border-white/15 bg-zinc-950/90 p-2" : "pointer-events-none"}`} style={style}>
        {editable && <button type="button" className="mb-1 block min-h-11 w-full cursor-move rounded bg-white/10 px-2 text-left font-sans text-xs text-zinc-200 focus-visible:ring-2 focus-visible:ring-violet-300" style={{ touchAction: "none" }} aria-label={`Move text note ${index + 1}`} onClick={() => { setSelectedId(note.id); setTool(null); }}
          onKeyDown={event => {
            const offsets: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
            const offset = offsets[event.key];
            if (!offset) return;
            event.preventDefault(); event.stopPropagation();
            updateNote(note.id, { x: Math.max(0, Math.min((containerRef.current?.clientWidth ?? 280) - 80, note.x + offset[0])), y: Math.max(0, Math.min((canvasRef.current?.height ?? 600) - 80, note.y + offset[1])) });
          }}
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setSelectedId(note.id); setTool(null);
            drag.current = { id: note.id, x: note.x, y: note.y, clientX: event.clientX, clientY: event.clientY };
          }}
          onPointerMove={event => {
            const start = drag.current;
            if (!start || start.id !== note.id) return;
            const x = Math.max(0, Math.min((containerRef.current?.clientWidth ?? 280) - 80, start.x + event.clientX - start.clientX));
            const y = Math.max(0, Math.min((canvasRef.current?.height ?? 600) - 80, start.y + event.clientY - start.clientY));
            setNotes(current => current.map(item => item.id === note.id ? { ...item, x, y } : item));
          }}
          onPointerUp={() => { drag.current = null; saveNotes(notes); }} onPointerCancel={() => { drag.current = null; saveNotes(notes); }}>
          Move / edit · drag or use arrow keys
        </button>}
        {selected ? <textarea aria-label={`Text note ${index + 1}`} autoFocus rows={3} maxLength={4000} className="block w-full resize-y bg-transparent outline-none focus:ring-1 focus:ring-yellow-300" style={{ font: "inherit", textDecoration: "inherit" }} value={note.text} onChange={event => updateNote(note.id, { text: event.target.value })} />
          : editable ? <button type="button" aria-label={`Edit text note ${index + 1}`} className="block min-h-11 w-full whitespace-pre-wrap text-left" onClick={() => { setSelectedId(note.id); setTool(null); }}>{note.text || "Type a note…"}</button>
          : <p aria-label={`Text note ${index + 1}`}>{note.text}</p>}
      </div>;
    })}
  </>;
}
