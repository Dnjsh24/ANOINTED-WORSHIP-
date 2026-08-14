import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isPrivateIpv4, selectLanAddress } = require("../../../desktop/lan-network.cjs") as {
  isPrivateIpv4: (address: string) => boolean;
  selectLanAddress: (networkInterfaces: Record<string, Array<{ address: string; family: string | number; internal: boolean }>>) => string | undefined;
};

describe("standalone Wi-Fi Worship Remote", () => {
  const html = readFileSync(resolve(process.cwd(), "desktop/lan-remote.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "desktop/main.cjs"), "utf8");

  it("keeps the requested source order", () => {
    expect(html.indexOf('id="songs"')).toBeLessThan(html.indexOf('id="open-presentations"'));
    expect(html.indexOf('id="open-presentations"')).toBeLessThan(html.indexOf('id="open-bible"'));
  });

  it("supports the bounded unified commands without embedding local media paths", () => {
    expect(html).toContain('send("present-presentation-slide",{presentationId:deck.id,slideId:slide.id})');
    expect(html).toContain('send("present-bible-verse",{reference:verse.reference,text:verse.text,translation:bible.translation})');
    expect(html).not.toContain("mediaUrl");
    expect(main).toContain('"present-presentation-slide", "present-bible-verse"');
    expect(main).toContain('new URL("/api/bible", appUrl)');
  });

  it("uses the physical LAN address when WSL is listed first", () => {
    expect(selectLanAddress({
      "vEthernet (WSL (Hyper-V firewall))": [
        { address: "172.22.176.1", family: "IPv4", internal: false },
      ],
      Ethernet: [
        { address: "192.168.1.14", family: "IPv4", internal: false },
      ],
    })).toBe("192.168.1.14");
  });

  it("ignores virtual, public, and loopback addresses", () => {
    expect(selectLanAddress({
      Tailscale: [{ address: "100.92.10.4", family: "IPv4", internal: false }],
      Ethernet: [{ address: "203.0.113.8", family: "IPv4", internal: false }],
      Loopback: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    })).toBeUndefined();
    expect(selectLanAddress({
      "Local network": [
        { address: "172.20.10.2", family: 4, internal: false },
        { address: "10.0.0.8", family: "IPv4", internal: false },
      ],
    })).toBe("10.0.0.8");
    expect(isPrivateIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateIpv4("192.168.0.1")).toBe(true);
    expect(isPrivateIpv4("172.31.255.254")).toBe(true);
    expect(isPrivateIpv4("172.32.0.1")).toBe(false);
    expect(isPrivateIpv4("192.168.0.999")).toBe(false);
    expect(isPrivateIpv4("not-an-address")).toBe(false);
  });
});
