import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clampWoolyPosition, useWoolyLauncherPosition } from "./use-wooly-launcher-position";

function pointerEvent(button: HTMLButtonElement, values: Partial<PointerEvent>) {
  return { currentTarget: button, button: 0, isPrimary: true, pointerId: 3, clientX: 100, clientY: 100, ...values } as unknown as React.PointerEvent<HTMLButtonElement>;
}

describe("Wooly launcher movement", () => {
  it("clamps the launcher within viewport bounds", () => {
    const bounds = { left: 20, top: 30, width: 300, height: 400 };
    expect(clampWoolyPosition({ left: -20, top: -20 }, 96, 96, bounds)).toEqual({ left: 28, top: 38 });
    expect(clampWoolyPosition({ left: 400, top: 500 }, 96, 96, bounds)).toEqual({ left: 216, top: 326 });
  });

  it("keeps small pointer movement as a tap and suppresses clicks after dragging", () => {
    const button = document.createElement("button");
    Object.defineProperties(button, { offsetWidth: { value: 80 }, offsetHeight: { value: 80 } });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 300, 80, 80));
    button.setPointerCapture = vi.fn();
    button.hasPointerCapture = vi.fn(() => true);
    button.releasePointerCapture = vi.fn();
    const ref = { current: button };
    const { result, rerender } = renderHook(({ greetingVisible }) => useWoolyLauncherPosition(ref, greetingVisible), { initialProps: { greetingVisible: true } });

    act(() => result.current.onPointerDown(pointerEvent(button, {})));
    act(() => result.current.onPointerMove(pointerEvent(button, { clientX: 104, clientY: 103 })));
    expect(result.current.style).toBeUndefined();
    act(() => result.current.onPointerUp(pointerEvent(button, { clientX: 104, clientY: 103 })));

    act(() => result.current.onPointerDown(pointerEvent(button, {})));
    act(() => result.current.onPointerMove(pointerEvent(button, { clientX: 140, clientY: 130 })));
    expect(result.current.style).toMatchObject({ left: 240, top: 330 });
    act(() => result.current.onPointerUp(pointerEvent(button, { clientX: 140, clientY: 130 })));

    act(() => rerender({ greetingVisible: false }));
    button.querySelector(".wooly-greeting")?.remove();
    act(() => result.current.moveBy("left"));
    const greeting = document.createElement("span");
    greeting.className = "wooly-greeting";
    Object.defineProperties(greeting, { offsetWidth: { value: 150 }, offsetHeight: { value: 106 } });
    vi.spyOn(greeting, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 150, 106));
    button.append(greeting);
    act(() => rerender({ greetingVisible: true }));
    expect(result.current.greetingStyle).toBeDefined();

    const click = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;
    act(() => result.current.onClickCapture(click));
    expect(click.preventDefault).toHaveBeenCalledOnce();
    expect(click.stopPropagation).toHaveBeenCalledOnce();

    act(() => result.current.onPointerDown(pointerEvent(button, {})));
    act(() => result.current.onPointerMove(pointerEvent(button, { clientX: 130 })));
    act(() => result.current.onLostPointerCapture());
    const keyboardClick = { detail: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;
    act(() => result.current.onClickCapture(keyboardClick));
    expect(keyboardClick.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.onPointerDown(pointerEvent(button, { pointerId: 4 })));
    act(() => result.current.onPointerUp(pointerEvent(button, { pointerId: 4 })));
    const tapClick = { detail: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;
    act(() => result.current.onClickCapture(tapClick));
    expect(tapClick.preventDefault).not.toHaveBeenCalled();
  });

  it("supports keyboard and tap controls, reset, and touch-pointer cancellation", () => {
    const button = document.createElement("button");
    Object.defineProperties(button, { offsetWidth: { value: 80 }, offsetHeight: { value: 80 } });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 300, 80, 80));
    button.setPointerCapture = vi.fn();
    button.hasPointerCapture = vi.fn(() => true);
    button.releasePointerCapture = vi.fn();
    const { result } = renderHook(() => useWoolyLauncherPosition({ current: button }, true));

    act(() => result.current.moveBy("right"));
    expect(result.current.style).toMatchObject({ left: 216, top: 300 });
    vi.mocked(button.getBoundingClientRect).mockReturnValue(new DOMRect(216, 300, 80, 80));
    act(() => result.current.onKeyDown({ key: "ArrowDown", currentTarget: button, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.KeyboardEvent<HTMLButtonElement>));
    expect(result.current.style).toMatchObject({ left: 216, top: 316 });
    act(() => result.current.onKeyDown({ key: "Home", currentTarget: button, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.KeyboardEvent<HTMLButtonElement>));
    expect(result.current.style).toBeUndefined();
    act(() => result.current.reset());
    expect(result.current.style).toBeUndefined();

    vi.mocked(button.getBoundingClientRect).mockReturnValue(new DOMRect(200, 300, 80, 80));
    act(() => result.current.onPointerDown(pointerEvent(button, { pointerType: "touch" } as Partial<PointerEvent>)));
    act(() => result.current.onPointerMove(pointerEvent(button, { pointerType: "touch", clientX: 130 } as Partial<PointerEvent>)));
    act(() => result.current.onPointerCancel(pointerEvent(button, { pointerType: "touch", clientX: 130 } as Partial<PointerEvent>)));
    expect(result.current.style).toMatchObject({ left: 230, top: 300 });
    expect(button.releasePointerCapture).toHaveBeenCalled();
    const postCancelClick = { detail: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;
    act(() => result.current.onClickCapture(postCancelClick));
    expect(postCancelClick.preventDefault).not.toHaveBeenCalled();
  });
});
