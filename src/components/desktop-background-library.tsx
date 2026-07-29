"use client";

import { useMemo, useState } from "react";
import { FolderOpen, FolderPlus, Image as ImageIcon, Loader2, Pencil, Search, Star, Trash2, Upload, Video } from "lucide-react";
import {
  assignDesktopSetlistBackgroundAction,
  createDesktopBackgroundCollectionAction,
  deleteDesktopBackgroundAction,
  favoriteDesktopBackgroundAction,
  registerImportedDesktopBackgrounds,
  renameDesktopBackgroundAction,
  setDesktopBackgroundCollectionAction,
} from "@/app/presenter/desktop-background-actions";

export type DesktopBackgroundAssetClient = {
  id: string;
  displayName: string;
  mediaType: "image" | "video";
  contentType: string;
  sizeBytes: number;
  favorite: boolean;
  createdAt: string;
  url: string;
  collectionIds: string[];
};

export type DesktopBackgroundCollectionClient = { id: string; name: string };

type Props = {
  setlistId: string;
  initialAssets: DesktopBackgroundAssetClient[];
  initialCollections: DesktopBackgroundCollectionClient[];
  selectedAssetId?: string | null;
  onSelect: (asset: DesktopBackgroundAssetClient | null) => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function DesktopBackgroundLibrary({ setlistId, initialAssets, initialCollections, selectedAssetId, onSelect }: Props) {
  const [assets, setAssets] = useState(initialAssets);
  const [selectedId, setSelectedId] = useState<string | null>(selectedAssetId ?? null);
  const [collections, setCollections] = useState(initialCollections);
  const [filter, setFilter] = useState<"all" | "image" | "video" | "favorite">("all");
  const [collectionFilter, setCollectionFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCollection, setNewCollection] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visibleAssets = useMemo(() => assets.filter((asset) => {
    if (filter === "image" && asset.mediaType !== "image") return false;
    if (filter === "video" && asset.mediaType !== "video") return false;
    if (filter === "favorite" && !asset.favorite) return false;
    if (collectionFilter && !asset.collectionIds.includes(collectionFilter)) return false;
    return asset.displayName.toLowerCase().includes(query.toLowerCase());
  }), [assets, collectionFilter, filter, query]);
  const libraryBytes = useMemo(() => assets.reduce((total, asset) => total + asset.sizeBytes, 0), [assets]);

  const update = (library: { assets: DesktopBackgroundAssetClient[]; collections: DesktopBackgroundCollectionClient[] }) => {
    setAssets(library.assets);
    setCollections(library.collections);
  };

  const importMedia = async (folder = false) => {
    if (!window.anointedDesktop) return;
    setBusy(true); setError(null);
    try {
      const result = folder ? await window.anointedDesktop.importBackgroundFolder() : await window.anointedDesktop.importBackgrounds();
      if (result.imports.length) update(await registerImportedDesktopBackgrounds(result.imports, result.collectionName));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import the selected media.");
    } finally { setBusy(false); }
  };

  const selectAsset = async (asset: DesktopBackgroundAssetClient | null) => {
    setBusy(true); setError(null);
    try {
      await assignDesktopSetlistBackgroundAction(setlistId, asset?.id ?? null);
      setSelectedId(asset?.id ?? null);
      onSelect(asset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set this background.");
    } finally { setBusy(false); }
  };

  const deleteAsset = async (asset: DesktopBackgroundAssetClient) => {
    if (!window.confirm(`Delete “${asset.displayName}” from this PC?`)) return;
    setBusy(true); setError(null);
    try {
      update(await deleteDesktopBackgroundAction(asset.id));
      if (asset.id === selectedId) { setSelectedId(null); onSelect(null); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this background.");
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-3 border-t border-white/5 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Local Background Library</p>
          <p className="text-[10px] text-emerald-400 mt-1">Stored only on this PC — never synced</p>
        </div>
        <div className="flex gap-1"><button onClick={() => void importMedia()} disabled={busy} className="inline-flex items-center gap-1 rounded bg-violet-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />} Import
        </button><button onClick={() => void importMedia(true)} disabled={busy} title="Import a folder" className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-white/20 disabled:opacity-50"><FolderOpen className="size-3" /> Folder</button></div>
      </div>
      <p className="text-[10px] text-zinc-500">{assets.length} file{assets.length === 1 ? "" : "s"} · {formatBytes(libraryBytes)} on this PC</p>

      <div className="relative">
        <Search className="absolute left-2 top-2 size-3 text-zinc-500" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search backgrounds" className="w-full rounded border border-white/10 bg-black/30 py-1.5 pl-7 pr-2 text-xs text-white outline-none focus:border-violet-500" />
      </div>

      <div className="flex flex-wrap gap-1">
        {([ ["all", "All"], ["image", "Images"], ["video", "Videos"], ["favorite", "Favorites"] ] as const).map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} className={`rounded px-2 py-1 text-[10px] font-semibold ${filter === value ? "bg-violet-600/30 text-violet-200" : "bg-white/5 text-zinc-400 hover:text-white"}`}>{label}</button>
        ))}
      </div>

      <div className="flex gap-1">
        <select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)} className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-zinc-300">
          <option value="">All collections</option>
          {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
        </select>
        <input value={newCollection} onChange={(event) => setNewCollection(event.target.value)} placeholder="New collection" className="min-w-0 w-28 rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white" />
        <button onClick={async () => { if (!newCollection.trim()) return; setBusy(true); try { update(await createDesktopBackgroundCollectionAction(newCollection)); setNewCollection(""); } finally { setBusy(false); } }} className="rounded bg-white/10 px-2 text-zinc-300 hover:text-white" title="Create collection"><FolderPlus className="size-3" /></button>
      </div>

      {selectedId && <button onClick={() => void selectAsset(null)} className="w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] font-semibold text-zinc-300 hover:bg-white/10">Remove local background from this setlist</button>}

      <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1">
        {visibleAssets.map((asset) => (
          <article key={asset.id} className={`group relative overflow-hidden rounded border ${asset.id === selectedId ? "border-violet-400 ring-1 ring-violet-400" : "border-white/10"}`}>
            <button onClick={() => void selectAsset(asset)} className="block w-full text-left">
              <div className="aspect-video bg-black">
                {asset.mediaType === "video" ? <video src={asset.url} muted preload="none" className="h-full w-full object-cover" /> : <img src={asset.url} alt="" loading="lazy" className="h-full w-full object-cover" />}
              </div>
              <div className="truncate px-1.5 py-1 text-[10px] font-semibold text-zinc-200">{asset.displayName}</div>
              <div className="px-1.5 pb-1 text-[9px] text-zinc-500">{asset.mediaType === "video" ? <Video className="mr-1 inline size-2.5" /> : <ImageIcon className="mr-1 inline size-2.5" />}{formatBytes(asset.sizeBytes)}</div>
            </button>
            <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button onClick={() => { const name = window.prompt("Background name", asset.displayName); if (name?.trim()) void renameDesktopBackgroundAction(asset.id, name).then(update); }} className="rounded bg-black/70 p-1 text-white"><Pencil className="size-3" /></button>
              <button onClick={() => void favoriteDesktopBackgroundAction(asset.id, !asset.favorite).then(update)} className="rounded bg-black/70 p-1 text-white"><Star className={`size-3 ${asset.favorite ? "fill-amber-300 text-amber-300" : ""}`} /></button>
              <button onClick={() => void deleteAsset(asset)} className="rounded bg-black/70 p-1 text-red-300"><Trash2 className="size-3" /></button>
            </div>
            {collections.length > 0 && <select aria-label="Collection" value={asset.collectionIds[0] || ""} onChange={(event) => void setDesktopBackgroundCollectionAction(asset.id, event.target.value, true).then(update)} className="absolute bottom-1 right-1 max-w-[80px] rounded bg-black/70 px-1 py-0.5 text-[9px] text-white opacity-0 group-hover:opacity-100"><option value="">Collection</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select>}
          </article>
        ))}
      </div>
      {visibleAssets.length === 0 && <p className="rounded border border-dashed border-white/10 p-3 text-center text-[10px] text-zinc-500">Import images or MP4/WebM videos to build this PC’s offline background library.</p>}
      {error && <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[10px] text-red-300">{error}</p>}
    </section>
  );
}
