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

import {
  SetlistForm,
  snapDragPreviewToCursor,
} from "@/components/setlist-form";

describe("SetlistForm drag preview", () => {
  it("centers the preview on the pointer instead of offsetting it to the side", () => {
    const transform = snapDragPreviewToCursor({
      activatorEvent: new MouseEvent("mousedown", {
        clientX: 280,
        clientY: 240,
      }),
      active: null,
      activeNodeRect: null,
      containerNodeRect: null,
      draggingNodeRect: {
        bottom: 260,
        height: 60,
        left: 200,
        right: 500,
        top: 200,
        width: 300,
      },
      over: null,
      overlayNodeRect: null,
      scrollableAncestors: [],
      scrollableAncestorRects: [],
      transform: { x: 120, y: 80, scaleX: 1, scaleY: 1 },
      windowRect: null,
    });

    expect(transform).toEqual({ x: 50, y: 90, scaleX: 1, scaleY: 1 });
  });

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
