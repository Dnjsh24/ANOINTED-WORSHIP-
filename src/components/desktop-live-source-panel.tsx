"use client";

import { useState } from "react";

export function DesktopLiveSourcePanel({ screens, cameras, onAdd }: { screens: Array<{ id: string; name: string }>; cameras: Array<{ id: string; name: string }>; onAdd: (kind: "live-screen" | "live-camera", sourceId: string) => void }) {
  const [screenId, setScreenId] = useState("");
  const [cameraId, setCameraId] = useState("");
  return <section className="mt-3 space-y-2 rounded border border-cyan-400/20 bg-cyan-500/5 p-2.5">
    <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-100">Local live sources</p>
    <div className="grid grid-cols-[1fr_auto] gap-1"><select value={screenId} onChange={(event) => setScreenId(event.target.value)} aria-label="Screen or window source" className="min-w-0 rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-[10px] text-white"><option value="">Choose screen or window</option>{screens.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><button disabled={!screenId} onClick={() => onAdd("live-screen", screenId)} className="rounded bg-cyan-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40">Add screen</button></div>
    <div className="grid grid-cols-[1fr_auto] gap-1"><select value={cameraId} onChange={(event) => setCameraId(event.target.value)} aria-label="Camera source" className="min-w-0 rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-[10px] text-white"><option value="">Choose camera</option>{cameras.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><button disabled={!cameraId} onClick={() => onAdd("live-camera", cameraId)} className="rounded bg-cyan-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40">Add camera</button></div>
    <p className="text-[9px] text-zinc-400">Sources run only in the Windows app and never sync to the website.</p>
  </section>;
}
