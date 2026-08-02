import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

describe("browser capability policy", () => {
  it("allows same-origin QR scanning without opening unrelated device capabilities", () => {
    expect(nextConfig).toContain('camera=(self), geolocation=(), microphone=(self)');
    expect(nextConfig).not.toContain('camera=(),');
  });
});
