import { act, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Setlist } from "@/lib/types";

const dndCallbacks = vi.hoisted(() => ({
  onDragCancel: undefined as (() => void) | undefined,
  onDragEnd: undefined as ((event: unknown) => void) | undefined,
  onDragMove: undefined as ((event: unknown) => void) | undefined,
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
    onDragCancel,
    onDragEnd,
    onDragMove,
    onDragStart,
  }: {
    children: ReactNode;
    onDragCancel?: () => void;
    onDragEnd?: (event: unknown) => void;
    onDragMove?: (event: unknown) => void;
    onDragStart: (event: unknown) => void;
  }) => {
    dndCallbacks.onDragCancel = onDragCancel;
    dndCallbacks.onDragEnd = onDragEnd;
    dndCallbacks.onDragMove = onDragMove;
    dndCallbacks.onDragStart = onDragStart;
    return <>{children}</>;
  },
  closestCenter: vi.fn(),
  DragOverlay: ({ children }: { children: ReactNode }) => (
    <div data-testid="setlist-drag-overlay">{children}</div>
  ),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: (sensor: unknown, options?: unknown) => ({ sensor, options }),
  useSensors: (...sensors: unknown[]) => sensors,
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

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: <T,>(items: T[], from: number, to: number) => {
    const nextItems = [...items];
    const [item] = nextItems.splice(from, 1);
    nextItems.splice(to, 0, item);
    return nextItems;
  },
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setActivatorNodeRef: vi.fn(),
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

import {
  SetlistForm,
  snapDragPreviewToCursor,
} from "@/components/setlist-form";

const librarySongs = [
  { id: "song-a", title: "Song A", original_key: "A", bpm: 70 },
  { id: "song-b", title: "Song B", original_key: "B", bpm: 72 },
  { id: "song-c", title: "Song C", original_key: "C", bpm: 74 },
  { id: "song-d", title: "Song D", original_key: "D", bpm: 76 },
];

function createSetlist(): Setlist {
  return {
    id: "setlist-1",
    name: "Sunday Service",
    date: "2026-08-16",
    leader: "",
    location: "Main Sanctuary",
    callTime: "09:00",
    rehearsalTime: "08:00",
    serviceTimes: ["Sunday Morning"],
    songs: librarySongs.slice(0, 3).map((song, index) => ({
      id: `slot-${index + 1}`,
      song: {
        id: song.id,
        title: song.title,
        artist: "",
        originalKey: song.original_key,
        currentKey: song.original_key,
        bpm: song.bpm,
        timeSignature: "4/4",
        tags: [],
        favorite: false,
        sections: [],
      },
      order: index + 1,
      assignedKey: song.original_key,
    })),
  };
}

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
        active: { id: "library-song-1", data: { current: song } },
      });
    });

    const overlay = screen.getByTestId("setlist-drag-overlay");
    expect(overlay).toHaveTextContent("Amazing Grace");
    expect(view.container).not.toContainElement(overlay);
    expect(overlay.parentElement).toBe(document.body);
  });

  it("keeps the library preview hidden while reordering a selected song", () => {
    const song = {
      id: "song-1",
      title: "For Your Glory I Will Live",
      original_key: "E",
      bpm: null,
    };
    render(<SetlistForm songs={[song]} />);

    act(() => {
      dndCallbacks.onDragStart?.({
        active: { id: "selected-song-1", data: { current: song } },
      });
    });

    expect(screen.getByTestId("setlist-drag-overlay")).toBeEmptyDOMElement();
  });

  it("opens an animated insertion gap between the two songs around the drop position", () => {
    render(<SetlistForm setlist={createSetlist()} songs={librarySongs} />);

    act(() => {
      dndCallbacks.onDragStart?.({
        active: { id: "library-song-d", data: { current: librarySongs[3] } },
      });
      dndCallbacks.onDragMove?.({
        active: {
          id: "library-song-d",
          data: { current: librarySongs[3] },
          rect: { current: { translated: { top: 115, height: 20 } } },
        },
        over: {
          id: "selected-song-b",
          rect: { top: 120, height: 60 },
        },
      });
    });

    const gap = screen.getByRole("status", {
      name: "Insert Song D as song 2",
    });
    expect(gap).toHaveTextContent("Drop as song 2");
    expect(gap.closest("li")?.previousElementSibling).toHaveAttribute(
      "aria-label",
      "1. Song A",
    );
    expect(gap.closest("li")?.nextElementSibling).toHaveAttribute(
      "aria-label",
      "2. Song B",
    );

    act(() => {
      dndCallbacks.onDragCancel?.();
    });
    expect(
      screen.queryByRole("status", { name: "Insert Song D as song 2" }),
    ).not.toBeInTheDocument();
  });

  it("visually lifts the selected song while the other rows animate around it", () => {
    render(<SetlistForm setlist={createSetlist()} songs={librarySongs} />);

    act(() => {
      dndCallbacks.onDragStart?.({
        active: {
          id: "selected-song-b",
          data: { current: librarySongs[1] },
        },
      });
    });

    const movingSong = screen.getByRole("listitem", { name: "2. Song B" });
    expect(movingSong).toHaveAttribute("data-reordering", "true");
    expect(movingSong).toHaveClass("border-violet-400/70");
    expect(movingSong.style.transition).toContain("transform");
  });

  it("reorders selected songs and inserts a library song at the dropped position", () => {
    render(<SetlistForm setlist={createSetlist()} songs={librarySongs} />);

    act(() => {
      dndCallbacks.onDragEnd?.({
        active: {
          id: "selected-song-c",
          data: { current: librarySongs[2] },
          rect: { current: { translated: null } },
        },
        over: {
          id: "selected-song-a",
          rect: { top: 100, height: 60 },
        },
      });
    });

    act(() => {
      dndCallbacks.onDragEnd?.({
        active: {
          id: "library-song-d",
          data: { current: librarySongs[3] },
          rect: { current: { translated: { top: 105, height: 20 } } },
        },
        over: {
          id: "selected-song-a",
          rect: { top: 120, height: 60 },
        },
      });
    });

    const songOrder = within(screen.getByRole("list", { name: "Setlist song order" }))
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("aria-label"));
    expect(songOrder).toEqual([
      "1. Song C",
      "2. Song D",
      "3. Song A",
      "4. Song B",
    ]);
    expect(
      [...document.querySelectorAll<HTMLInputElement>('input[name="songIds"]')]
        .map((input) => input.value),
    ).toEqual(["song-c", "song-d", "song-a", "song-b"]);
  });
});
