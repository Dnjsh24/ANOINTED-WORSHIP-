import "@testing-library/jest-dom/vitest";

// JSDOM lacks pointer capture; real capture behavior is verified in browser tests.
if (typeof Element !== "undefined" && !Element.prototype.setPointerCapture) {
  Object.defineProperties(Element.prototype, {
    setPointerCapture: { configurable: true, writable: true, value: () => undefined },
    hasPointerCapture: { configurable: true, writable: true, value: () => false },
    releasePointerCapture: { configurable: true, writable: true, value: () => undefined },
  });
}
