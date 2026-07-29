"use client";

import { useEffect, useMemo, useState } from "react";
import { MonitorCheck, Plus, Presentation, RefreshCw, Settings2, Trash2, Tv2 } from "lucide-react";
import { deleteDesktopAudienceLookAction, deleteDesktopOutputConfigAction, saveDesktopAudienceLookAction, saveDesktopOutputConfigAction } from "@/app/presenter/desktop-production-layout-actions";
import { defaultAudienceLookLayout, encodeAudienceLookLayout, type AudienceLookLayout } from "@/lib/desktop/audience-looks";

type Display = { id: string; label: string; width: number; height: number; primary: boolean };
type Look = { id: string; name: string; layout: AudienceLookLayout };
type Output = { id: string; name: string; displayId: string | null; lookId: string | null; route: "projector" | "confidence" | "stream" | "lobby"; enabled: boolean };

export function DesktopOutputControls({ setlistId, onPresent, looks: initialLooks = [], outputConfigs: initialOutputs = [] }: { setlistId: string; onPresent: () => void; looks?: Look[]; outputConfigs?: Output[] }) {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [projectorDisplayId, setProjectorDisplayId] = useState("");
  const [confidenceDisplayId, setConfidenceDisplayId] = useState("");
  const [projectorOpen, setProjectorOpen] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const [logicalOutputStatus, setLogicalOutputStatus] = useState<Record<string, { open: boolean; displayId: string | null }>>({});
  const [notice, setNotice] = useState("");
  const [looks, setLooks] = useState(initialLooks);
  const [outputs, setOutputs] = useState(initialOutputs);
  const [newLookName, setNewLookName] = useState("");
  const [newOutputName, setNewOutputName] = useState("");
  const [newOutputRoute, setNewOutputRoute] = useState<Output["route"]>("projector");
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    if (!window.anointedDesktop) return;
    const [nextDisplays, status] = await Promise.all([window.anointedDesktop.listDisplays(), window.anointedDesktop.getOutputStatus()]);
    setDisplays(nextDisplays);
    setProjectorDisplayId(status.projectorDisplayId || nextDisplays.find((display) => !display.primary)?.id || nextDisplays[0]?.id || "");
    setConfidenceDisplayId(status.confidenceDisplayId || nextDisplays.find((display) => !display.primary)?.id || nextDisplays[0]?.id || "");
    setProjectorOpen(status.projectorOpen); setConfidenceOpen(status.confidenceOpen);
    setLogicalOutputStatus(Object.fromEntries(status.logicalOutputs.map((output) => [output.id, { open: output.open, displayId: output.displayId }])));
  };
  useEffect(() => {
    void refresh();
    return window.anointedDesktop?.onDisplaysChanged((nextDisplays) => { setDisplays(nextDisplays); setNotice("Displays changed. Review the selected outputs."); });
  }, []);

  const displayOptions = useMemo(() => displays.map((display) => <option key={display.id} value={display.id}>{display.label} - {display.width}x{display.height}{display.primary ? " (Primary)" : ""}</option>), [displays]);
  const present = async () => {
    if (!window.anointedDesktop) return;
    const result = await window.anointedDesktop.openProjector(setlistId, projectorDisplayId || undefined);
    setProjectorOpen(true); onPresent();
    setNotice(result.usedFallback ? "Saved projector display is disconnected; output is using the primary display." : "Projector is presenting.");
  };
  const confidence = async () => {
    if (!window.anointedDesktop) return;
    const result = await window.anointedDesktop.openConfidence(setlistId, confidenceDisplayId || undefined);
    setConfidenceOpen(true);
    setNotice(result.usedFallback ? "Saved confidence display is disconnected; output is using the primary display." : "Confidence display is open.");
  };
  const addLook = async () => {
    if (!newLookName.trim()) return;
    setSaving(true);
    try {
      const name = newLookName.trim();
      const id = await saveDesktopAudienceLookAction({ name, layout: {} });
      setLooks((items) => [...items, { id, name, layout: defaultAudienceLookLayout(name) }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLookName(""); setNotice("Audience Look saved locally.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save Audience Look."); } finally { setSaving(false); }
  };
  const updateLook = async (look: Look, changes: Partial<AudienceLookLayout>) => {
    const next = { ...look, layout: { ...look.layout, ...changes } };
    setLooks((items) => items.map((item) => item.id === look.id ? next : item));
    try {
      await saveDesktopAudienceLookAction(next);
    } catch (error) {
      setLooks((items) => items.map((item) => item.id === look.id ? look : item));
      setNotice(error instanceof Error ? error.message : "Could not update Audience Look.");
    }
  };
  const addOutput = async () => {
    if (!newOutputName.trim()) return;
    setSaving(true);
    try {
      const id = await saveDesktopOutputConfigAction({ name: newOutputName, route: newOutputRoute, lookId: looks[0]?.id ?? null, displayId: null, enabled: true });
      setOutputs((items) => [...items, { id, name: newOutputName.trim(), route: newOutputRoute, lookId: looks[0]?.id ?? null, displayId: null, enabled: true }]);
      setNewOutputName(""); setNotice("Logical output saved locally.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save output."); } finally { setSaving(false); }
  };
  const updateOutput = async (output: Output, changes: Partial<Output>) => {
    const next = { ...output, ...changes };
    setOutputs((items) => items.map((item) => item.id === output.id ? next : item));
    try {
      await saveDesktopOutputConfigAction(next);
    } catch (error) {
      setOutputs((items) => items.map((item) => item.id === output.id ? output : item));
      setNotice(error instanceof Error ? error.message : "Could not update output.");
    }
  };

  return <div className="space-y-2 rounded border border-white/10 bg-black/20 p-2.5">
    <div className="flex items-center justify-between gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400"><span className="flex items-center gap-1.5"><MonitorCheck className="size-3" /> Desktop outputs</span><span className="flex gap-1"><button onClick={() => void refresh()} className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white" title="Refresh displays"><RefreshCw className="size-3" /></button><button onClick={() => setShowSetup((open) => !open)} className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white" title="Configure outputs"><Settings2 className="size-3" /></button></span></div>
    <div className="grid grid-cols-[1fr_auto] gap-1.5"><select aria-label="Projector display" value={projectorDisplayId} onChange={(event) => setProjectorDisplayId(event.target.value)} className="min-w-0 rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-[10px] text-white">{displayOptions}</select><button onClick={() => void present()} className="inline-flex items-center gap-1 rounded bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500"><Presentation className="size-3.5" /> Present</button></div>
    <div className="grid grid-cols-[1fr_auto] gap-1.5"><select aria-label="Confidence display" value={confidenceDisplayId} onChange={(event) => setConfidenceDisplayId(event.target.value)} className="min-w-0 rounded border border-white/10 bg-[#171717] px-2 py-1.5 text-[10px] text-white">{displayOptions}</select><button onClick={() => void confidence()} className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-white/20"><Tv2 className="size-3" /> Confidence</button></div>
    {showSetup && <section className="space-y-2 border-t border-white/10 pt-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Audience Looks and logical outputs (PC only)</p>
      <div className="flex gap-1"><input value={newLookName} onChange={(event) => setNewLookName(event.target.value)} placeholder="New Look" maxLength={80} className="min-w-0 flex-1 rounded border border-white/10 bg-[#171717] px-2 py-1 text-[10px] text-white" /><button disabled={saving} onClick={() => void addLook()} className="rounded bg-white/10 px-2 text-[10px] font-bold hover:bg-white/15"><Plus className="size-3" /></button></div>
      <div className="space-y-1">{looks.map((look) => <div key={look.id} className="rounded bg-violet-500/10 p-1.5 text-[9px] text-violet-100"><div className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate font-bold">{look.name}</span><button title={`Delete ${look.name}`} onClick={async () => { await deleteDesktopAudienceLookAction(look.id); setLooks((items) => items.filter((item) => item.id !== look.id)); }}><Trash2 className="size-2.5" /></button></div><div className="mt-1 grid grid-cols-2 gap-1 text-zinc-300"><label><input checked={look.layout.showLyrics} type="checkbox" onChange={(event) => void updateLook(look, { showLyrics: event.target.checked })} /> Lyrics</label><label><input checked={look.layout.showSceneLayers} type="checkbox" onChange={(event) => void updateLook(look, { showSceneLayers: event.target.checked })} /> Layers</label><label><input checked={look.layout.showProps} type="checkbox" onChange={(event) => void updateLook(look, { showProps: event.target.checked })} /> Props</label><select value={look.layout.lyricStyle} onChange={(event) => void updateLook(look, { lyricStyle: event.target.value as AudienceLookLayout["lyricStyle"] })} aria-label={`${look.name} lyric style`} className="rounded border border-white/10 bg-[#171717] px-1 py-0.5 text-[9px] text-white"><option value="full">Full lyrics</option><option value="lower-third">Lower third</option><option value="hidden">Hide lyrics</option></select></div></div>)}</div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-1"><input value={newOutputName} onChange={(event) => setNewOutputName(event.target.value)} placeholder="New output" maxLength={80} className="min-w-0 rounded border border-white/10 bg-[#171717] px-2 py-1 text-[10px] text-white" /><select value={newOutputRoute} onChange={(event) => setNewOutputRoute(event.target.value as Output["route"])} className="rounded border border-white/10 bg-[#171717] px-1 text-[10px] text-white"><option value="projector">Projector</option><option value="confidence">Confidence</option><option value="stream">Stream</option><option value="lobby">Lobby</option></select><button disabled={saving || outputs.length >= 16} onClick={() => void addOutput()} className="rounded bg-white/10 px-2 text-[10px] font-bold hover:bg-white/15"><Plus className="size-3" /></button></div>
      {outputs.map((output) => <div key={output.id} className="space-y-1 rounded bg-white/5 p-1.5"><div className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{output.name}</span><label className="text-[9px] text-zinc-400"><input checked={output.enabled} type="checkbox" onChange={(event) => void updateOutput(output, { enabled: event.target.checked })} /> On</label><button onClick={async () => { await deleteDesktopOutputConfigAction(output.id); setOutputs((items) => items.filter((item) => item.id !== output.id)); }} title={`Delete ${output.name}`} className="text-red-300"><Trash2 className="size-3" /></button></div><div className="grid grid-cols-2 gap-1"><select value={output.lookId || ""} onChange={(event) => void updateOutput(output, { lookId: event.target.value || null })} aria-label={`${output.name} Audience Look`} className="min-w-0 rounded border border-white/10 bg-[#171717] px-1 py-1 text-[9px] text-white"><option value="">No Look</option>{looks.map((look) => <option key={look.id} value={look.id}>{look.name}</option>)}</select><select value={output.displayId || ""} onChange={(event) => void updateOutput(output, { displayId: event.target.value || null })} aria-label={`${output.name} display`} className="min-w-0 rounded border border-white/10 bg-[#171717] px-1 py-1 text-[9px] text-white"><option value="">Saved/default display</option>{displayOptions}</select></div></div>)}
    </section>}
    {outputs.filter((output) => output.enabled).length > 0 && <div className="space-y-1 border-t border-white/5 pt-2"><p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Logical outputs ({outputs.filter((output) => output.enabled).length}/16)</p>{outputs.filter((output) => output.enabled).map((output) => { const mappedDisplay = displays.find((display) => display.id === output.displayId); const status = logicalOutputStatus[output.id]; return <button key={output.id} onClick={async () => { if (!window.anointedDesktop) return; const look = looks.find((item) => item.id === output.lookId); await window.anointedDesktop.openLogicalOutput(output.id, output.route === "confidence" ? "confidence" : "projector", setlistId, output.displayId || undefined, look?.name, look ? encodeAudienceLookLayout(look.layout) : undefined); await refresh(); setNotice(`${output.name} opening.`); }} className="flex w-full items-center justify-between rounded bg-white/5 px-2 py-1.5 text-left text-[10px] font-semibold hover:bg-white/10"><span>{output.name}</span><span className="text-right text-zinc-500">{looks.find((look) => look.id === output.lookId)?.name || output.route} · {mappedDisplay ? `${mappedDisplay.width}×${mappedDisplay.height}` : "Default display"} · {status?.open ? "Open" : "Closed"}</span></button>; })}</div>}
    <p className="text-[10px] text-zinc-500">{projectorOpen ? "Projector open" : "Projector closed"} · {confidenceOpen ? "Confidence open" : "Confidence closed"}</p>
    {notice && <p className="text-[10px] text-amber-300">{notice}</p>}
  </div>;
}
