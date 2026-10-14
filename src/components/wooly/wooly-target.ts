/** Track viewport geometry through page animations and layout shifts, not just scroll events. */
export function trackWoolyTarget(targetName: string, onChange: (rectangle: DOMRect | null) => void) {
  let target: HTMLElement | undefined;
  let scrolledTarget: HTMLElement | undefined;
  let previousRectangle: DOMRect | null | undefined;
  let previousViewportWidth = window.innerWidth;
  let previousViewportHeight = window.innerHeight;
  let nextLookup = 0;
  let frame = 0;
  let active = true;

  const measure = (time: number) => {
    if (!target?.isConnected || target.getClientRects().length === 0) {
      target = undefined;
      if (time >= nextLookup) {
        target = [...document.querySelectorAll<HTMLElement>("[data-wooly-target]")]
          .find((element) => element.dataset.woolyTarget === targetName && element.getClientRects().length > 0);
        nextLookup = time + 150;
      }
    }
    if (target && scrolledTarget !== target) {
      scrolledTarget = target;
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: window.matchMedia("(max-width: 640px)").matches ? "start" : "center",
      });
    }
    const bounds = target?.getBoundingClientRect();
    const rectangle = bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null;
    const unchanged = previousRectangle === rectangle || (previousRectangle && rectangle
      && previousRectangle.x === rectangle.x && previousRectangle.y === rectangle.y
      && previousRectangle.width === rectangle.width && previousRectangle.height === rectangle.height);
    const viewportChanged = previousViewportWidth !== window.innerWidth || previousViewportHeight !== window.innerHeight;
    if (!unchanged || viewportChanged) {
      previousRectangle = rectangle;
      previousViewportWidth = window.innerWidth;
      previousViewportHeight = window.innerHeight;
      onChange(rectangle);
    }
    if (active) frame = window.requestAnimationFrame(measure);
  };

  frame = window.requestAnimationFrame(measure);
  return () => {
    active = false;
    window.cancelAnimationFrame(frame);
  };
}
