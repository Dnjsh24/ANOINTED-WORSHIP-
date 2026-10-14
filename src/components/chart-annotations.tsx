"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { chartAnnotationKeys, noteFonts, parseChartNotes, type ChartNote } from "@/lib/domain/chart-annotations";

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
const controlClass = "min-h-11 rounded border border-white/20 bg-zinc-900 px-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300";

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
  const [saveError, setSaveError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drag = useRef<{ id: string; x: number; y: number; clientX: number; clientY: number } | null>(null);
  const selectedNote = notes.find(note => note.id === selectedId);

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
      font: "sans", fontSize: 24, bold: false, italic: false, underline: false, strike: false,
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
    {editable && <div data-chart-annotation className="fixed bottom-4 left-4 right-20 z-40 flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-zinc-950/95 p-2 shadow-xl" aria-label="Practice annotations" role="group">
      <button type="button" className={controlClass} aria-label="Apple Pencil Annotations" aria-pressed={tool === "pen"} onClick={() => { setSelectedId(undefined); setTool(tool === "pen" ? null : "pen"); }}>Pen</button>
      <button type="button" className={controlClass} aria-pressed={tool === "eraser"} onClick={() => { setSelectedId(undefined); setTool(tool === "eraser" ? null : "eraser"); }}>Eraser</button>
      {tool && <label className="text-xs text-zinc-300">Pen size <input aria-label="Pen size" className="w-20 accent-violet-400" type="range" min="2" max="50" value={penSize} onChange={event => setPenSize(Number(event.target.value))} /></label>}
      <button type="button" className={controlClass} disabled={notes.length >= 100} onClick={addNote}>Add text note</button>
      <span className="text-xs text-zinc-400">Saved on this device · visible in Stage</span>
      {tool && <p className="w-full text-xs text-zinc-300">Turn the pen or eraser off to scroll the chart.</p>}
      {saveError && <p role="alert" className="w-full text-sm text-amber-200">{saveError}</p>}
      {selectedNote && <div className="flex w-full flex-wrap items-center gap-2 border-t border-white/10 pt-2">
        <label className="text-xs text-zinc-300">Font <select aria-label="Note font" className={controlClass} value={selectedNote.font} onChange={event => updateNote(selectedNote.id, { font: event.target.value as ChartNote["font"] })}>
          <option value="sans">Arial</option><option value="serif">Georgia</option><option value="mono">Monospace</option>
        </select></label>
        <label className="text-xs text-zinc-300">Size <select aria-label="Note font size" className={controlClass} value={selectedNote.fontSize} onChange={event => updateNote(selectedNote.id, { fontSize: Number(event.target.value) })}>
          {[12, 16, 18, 24, 32, 48, 64, 72].map(size => <option key={size} value={size}>{size}px</option>)}
        </select></label>
        {([['bold', 'Bold'], ['italic', 'Italic'], ['underline', 'Underline'], ['strike', 'Strikethrough']] as const).map(([property, label]) => <button type="button" key={property} className={controlClass} aria-pressed={selectedNote[property]} onClick={() => updateNote(selectedNote.id, { [property]: !selectedNote[property] })}>{label}</button>)}
        <button type="button" className={controlClass} onClick={() => { saveNotes(notes.filter(note => note.id !== selectedNote.id)); setSelectedId(undefined); }}>Delete note</button>
        <button type="button" className={controlClass} onClick={() => setSelectedId(undefined)}>Done editing</button>
      </div>}
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
        context.strokeStyle = "rgba(250, 204, 21, 0.8)";
        context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
        context.lineWidth = tool === "eraser" ? penSize * 4 : penSize;
        context.lineCap = "round";
        context.stroke();
      }} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} onLostPointerCapture={stopDrawing} />
    {notes.map((note, index) => {
      const selected = editable && selectedId === note.id;
      const style: CSSProperties = {
        left: `clamp(0px, ${note.x}px, calc(100% - 80px))`, top: note.y, fontFamily: noteFonts[note.font], fontSize: note.fontSize,
        fontWeight: note.bold ? "bold" : "normal", fontStyle: note.italic ? "italic" : "normal",
        textDecoration: [note.underline && "underline", note.strike && "line-through"].filter(Boolean).join(" "),
        maxWidth: `max(80px, calc(100% - ${note.x}px))`,
      };
      return <div key={note.id} data-chart-annotation className={`absolute z-30 w-64 whitespace-pre-wrap break-words rounded text-yellow-300 ${editable ? "border border-yellow-300/30 bg-zinc-950/90 p-2" : "pointer-events-none"}`} style={style}>
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
