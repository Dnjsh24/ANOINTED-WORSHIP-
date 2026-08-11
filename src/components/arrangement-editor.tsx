"use client";

import { useState } from "react";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import { createPortal } from "react-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Minus, Plus, X } from "lucide-react";
import {
  createArrangementSectionId,
  createArrangementSections,
  formatArrangementSequence,
  parseArrangementSections,
  resolveArrangementSongSections,
  type ArrangementSection,
} from "@/lib/domain/arrangements";

const STANDARD_SECTIONS = [
  "Intro",
  "Verse 1",
  "Verse 2",
  "Verse 3",
  "Chorus 1",
  "Chorus 2",
  "Chorus 3",
  "Pre-Chorus",
  "Bridge",
  "Tag",
  "Interlude",
  "Instrumental",
  "Outro",
  "Ending",
  "C",
  "V1",
  "V2",
  "B",
];

interface SortableItemProps {
  id: string;
  value: string;
  position: number;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  isDragging?: boolean;
  isSelected?: boolean;
}

function SortableItem({
  id,
  value,
  position,
  onRemove,
  onSelect,
  isDragging: isActiveDrag,
  isSelected,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-3 p-3 mb-2 rounded-xl border shadow-sm ${
        isDragging || isActiveDrag
          ? "opacity-75 shadow-lg border-violet-500/50 bg-zinc-800"
          : isSelected
            ? "bg-violet-500/10 border-violet-500/40"
            : "bg-zinc-800 border-zinc-700/50"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          aria-label={`Move ${value} ${position}`}
          className="text-zinc-500 hover:text-zinc-300 touch-none cursor-grab active:cursor-grabbing p-1 -ml-1"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
        <button
          type="button"
          aria-label={`Edit ${value} ${position}`}
          onClick={() => onSelect(id)}
          className="min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left font-medium text-zinc-200 hover:bg-white/5 hover:text-white"
        >
          {value}
        </button>
      </div>
      <button
        type="button"
        aria-label={`Remove ${value} ${position}`}
        onClick={() => onRemove(id)}
        className="text-zinc-500 hover:text-red-400 p-1.5 rounded-full hover:bg-red-500/10 transition"
      >
        <Minus className="size-4" />
      </button>
    </div>
  );
}

function initialEditorContent(
  initialArrangement: string,
  lyrics?: string,
  initialSections?: ArrangementSection[] | null,
) {
  return parseArrangementSections(initialSections)
    ?? createArrangementSections(initialArrangement, lyrics);
}

export function ArrangementEditor({
  onClose,
  onSave,
  songTitle,
  initialArrangement,
  lyrics,
  initialSections,
}: {
  onClose: () => void;
  onSave: (newArrangement: string, sections: ArrangementSection[]) => void | Promise<void>;
  songTitle: string;
  initialArrangement: string;
  lyrics?: string;
  initialSections?: ArrangementSection[] | null;
}) {
  const [initialContent] = useState(() =>
    initialEditorContent(initialArrangement, lyrics, initialSections),
  );
  const [sections, setSections] = useState<ArrangementSection[]>(initialContent);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    initialContent[0]?.id ?? null,
  );
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const dialogRef = useAccessibleDialog({ open: true, onClose });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingSectionId(null);

    if (over && active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleRemove = (idToRemove: string) => {
    setSections((items) => {
      const removedIndex = items.findIndex((item) => item.id === idToRemove);
      const nextItems = items.filter((item) => item.id !== idToRemove);
      if (selectedSectionId === idToRemove) {
        setSelectedSectionId(
          nextItems[Math.min(Math.max(removedIndex, 0), nextItems.length - 1)]?.id ?? null,
        );
      }
      return nextItems;
    });
  };

  const handleAddSection = (value: string) => {
    const source = createArrangementSections(value, lyrics)[0];
    const section: ArrangementSection = {
      id: createArrangementSectionId(value),
      label: value,
      content: source?.content ?? "",
    };
    setSections((items) => [...items, section]);
    setSelectedSectionId(section.id);
  };

  const handleSave = () => {
    const newArrangement = formatArrangementSequence(sections);
    onSave(newArrangement, sections);
    onClose();
  };

  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? null;
  const displaySections = resolveArrangementSongSections("", sections);
  const canSave = sections.every((section) => section.label.trim().length > 0);

  const updateSelectedSection = (changes: Partial<Pick<ArrangementSection, "label" | "content">>) => {
    if (!selectedSectionId) return;
    setSections((items) => items.map((section) =>
      section.id === selectedSectionId ? { ...section, ...changes } : section,
    ));
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-0">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="arrangement-editor-title"
        tabIndex={-1}
        className="w-full sm:w-[900px] max-w-[95vw] h-[85vh] sm:max-h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800/60 bg-zinc-900/50">
          <div>
            <h2 id="arrangement-editor-title" className="text-xl font-bold text-white tracking-tight">
              Edit Arrangement
            </h2>
            <p className="text-sm text-zinc-400 mt-0.5 line-clamp-1">
              {songTitle}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close arrangement editor"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-full transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content Split */}
        <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">
          
          {/* Left Column: Editor */}
          <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-zinc-700 sm:border-r border-zinc-800/60">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-4">
              Song Sequence (Drag up/down to reorder)
            </p>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(e) => setDraggingSectionId(e.active.id as string)}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setDraggingSectionId(null)}
            >
              <SortableContext
                items={sections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="min-h-[100px]">
                  {sections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-zinc-800 rounded-xl">
                      <p className="text-sm text-zinc-500">
                        No sections yet. Add some below!
                      </p>
                    </div>
                  ) : (
                    sections.map((section, index) => (
                      <SortableItem
                        key={section.id}
                        id={section.id}
                        value={section.label}
                        position={index + 1}
                        onRemove={handleRemove}
                        onSelect={setSelectedSectionId}
                        isDragging={draggingSectionId === section.id}
                        isSelected={selectedSectionId === section.id}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-8">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-4">
                Add Sections (Tap to add)
              </p>
              <div className="flex flex-wrap gap-2">
                {STANDARD_SECTIONS.map((section) => (
                  <button
                    key={section}
                    type="button"
                    aria-label={`Add ${section}`}
                    onClick={() => handleAddSection(section)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-sm text-zinc-300 hover:text-white border border-zinc-700/50 hover:border-zinc-700 transition"
                  >
                    <Plus className="size-3.5" />
                    {section}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Right Column: Selected Section Editor */}
          <div className="flex-1 overflow-y-auto bg-zinc-900/30 p-5 scrollbar-thin scrollbar-thumb-zinc-700">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Edit Selected Section
              </p>
              {selectedSection && (
                <span className="rounded bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400">
                  Live preview
                </span>
              )}
            </div>

            {selectedSection ? (
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-300">Section name</span>
                  <input
                    aria-label="Section name"
                    value={selectedSection.label}
                    maxLength={80}
                    onChange={(event) => updateSelectedSection({ label: event.target.value })}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-300">Chords and lyrics</span>
                  <textarea
                    aria-label="Chords and lyrics"
                    value={selectedSection.content}
                    maxLength={20_000}
                    rows={10}
                    spellCheck={false}
                    placeholder={`G  C  D\nType the lyric line here\n\nOr use [G]inline [C]chords`}
                    onChange={(event) => updateSelectedSection({ content: event.target.value })}
                    className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 font-mono text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  />
                  <span className="block text-[11px] leading-relaxed text-zinc-500">
                    Put a chord line above its lyric, or place chords inline like [G]Amazing [C]grace.
                  </span>
                </label>

                <div className="border-t border-zinc-800 pt-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Arrangement Preview
                  </p>
                  <div className="space-y-6">
                    {displaySections.map((sec, index) => (
                      <div
                        key={sections[index]?.id ?? `${sec.label}-${index}`}
                        className={sections[index]?.id === selectedSectionId ? "rounded-xl border border-violet-500/20 bg-violet-500/5 p-3" : "px-3"}
                      >
                        <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-violet-300">
                          [{sec.label}]
                        </h4>
                        {sec.lines.length > 0 ? (
                          <div className="space-y-3 font-mono text-sm leading-relaxed">
                            {sec.lines.map((line, lineIndex) => (
                              <div key={`${line.lyric}-${lineIndex}`} className="flex flex-col">
                                {line.chords && (
                                  <span className="whitespace-pre-wrap font-bold text-violet-400/80">{line.chords}</span>
                                )}
                                {line.tokens?.length ? (
                                  <span className="whitespace-pre-wrap text-zinc-200">
                                    {line.tokens.map((token) => `${token.chord ? `[${token.chord}]` : ""}${token.lyric}`).join("")}
                                  </span>
                                ) : line.lyric ? (
                                  <span className="whitespace-pre-wrap text-zinc-200">{line.lyric}</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm italic text-zinc-600">Add chords or lyrics above.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-40 flex-col items-center justify-center text-sm italic text-zinc-500">
                Add or select a section to edit its chords and lyrics.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-800/60 bg-zinc-900/90 backdrop-blur shrink-0">
          <div className="flex gap-3 justify-end max-w-sm ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Arrangement
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
