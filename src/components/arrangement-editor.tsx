"use client";

import React, { useState, useEffect } from "react";
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
  onRemove: (id: string) => void;
}

function SortableItem({ id, value, onRemove }: SortableItemProps) {
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
      className={`flex items-center justify-between gap-3 p-3 mb-2 rounded-xl bg-zinc-800 border border-zinc-700/50 shadow-sm ${
        isDragging ? "opacity-75 shadow-lg border-violet-500/50" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-zinc-500 hover:text-zinc-300 touch-none cursor-grab active:cursor-grabbing p-1 -ml-1"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
        <span className="text-zinc-200 font-medium">{value}</span>
      </div>
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="text-zinc-500 hover:text-red-400 p-1.5 rounded-full hover:bg-red-500/10 transition"
      >
        <Minus className="size-4" />
      </button>
    </div>
  );
}

export function ArrangementEditor({
  isOpen,
  onClose,
  onSave,
  songTitle,
  initialArrangement,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newArrangement: string) => void;
  songTitle: string;
  initialArrangement: string;
}) {
  const [sections, setSections] = useState<{ id: string; value: string }[]>([]);

  useEffect(() => {
    if (isOpen) {
      const parsed = initialArrangement
        ? initialArrangement.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      setSections(
        parsed.map((value, index) => ({ id: `section-${index}-${Date.now()}`, value }))
      );
    }
  }, [isOpen, initialArrangement]);

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

    if (over && active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleRemove = (idToRemove: string) => {
    setSections((items) => items.filter((item) => item.id !== idToRemove));
  };

  const handleAddSection = (value: string) => {
    setSections((items) => [
      ...items,
      { id: `section-${items.length}-${Date.now()}`, value },
    ]);
  };

  const handleSave = () => {
    const newArrangement = sections.map((s) => s.value).join(", ");
    onSave(newArrangement);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-0">
      <div
        className="w-full sm:w-[480px] max-h-[85vh] bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-zinc-800/60">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Edit Arrangement
            </h2>
            <p className="text-sm text-zinc-400 mt-0.5 line-clamp-1">
              {songTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-full transition"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-zinc-700">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-4">
            Song Sequence (Drag up/down to reorder)
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
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
                  sections.map((section) => (
                    <SortableItem
                      key={section.id}
                      id={section.id}
                      value={section.value}
                      onRemove={handleRemove}
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

        <div className="p-5 border-t border-zinc-800/60 bg-zinc-900/90 backdrop-blur">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition"
            >
              Save Arrangement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
