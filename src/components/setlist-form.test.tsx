import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const dndCallbacks = vi.hoisted(() => ({
  onDragStart: undefined as ((event: unknown) => void) | undefined,
}));

vi.mock("@/app/actions", () => ({
  createSetlistAction: vi.fn(),
  deleteSetlistAction: vi.fn(),
  updateSetlistAction: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragStart,
  }: {
    children: ReactNode;
    onDragStart: (event: unknown) => void;
  }) => {
    dndCallbacks.onDragStart = onDragStart;
    return <>{children}</>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => (
    <div data-testid="setlist-drag-overlay">{children}</div>
  ),
  useDraggable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setNodeRef: vi.fn(),
  }),
  useDroppable: () => ({
    isOver: false,
    setNodeRef: vi.fn(),
  }),
}));

import { SetlistForm } from "@/components/setlist-form";

describe("SetlistForm drag preview", () => {
  it("renders the active song preview outside the animated form layout", () => {
    const song = {
      id: "song-1",
      title: "Amazing Grace",
      original_key: "G",
      bpm: 72,
    };
    const view = render(<SetlistForm songs={[song]} />);

    act(() => {
      dndCallbacks.onDragStart?.({
        active: { data: { current: song } },
      });
    });

    const overlay = screen.getByTestId("setlist-drag-overlay");
    expect(overlay).toHaveTextContent("Amazing Grace");
    expect(view.container).not.toContainElement(overlay);
    expect(overlay.parentElement).toBe(document.body);
  });
});
