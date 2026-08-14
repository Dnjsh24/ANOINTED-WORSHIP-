import type { NextConfig } from "next";

export function createNextConfig(desktopBuild: boolean): NextConfig {
  return {
    // Electron starts the self-contained Next server from .next/standalone.
    // The web deployment retains its normal output mode.
    output: desktopBuild ? "standalone" : undefined,
    // PDF.js uses this native N-API module for DOMMatrix/ImageData/Path2D in
    // Electron's local Node server. Keep the binary out of webpack's JS bundle.
    serverExternalPackages: ["@napi-rs/canvas"],
    allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.14", "192.168.1.14:3100"],
    reactStrictMode: true,
    experimental: {
      // Editable desktop scene-layer payloads can legitimately exceed the
      // framework's 1 MB action default. Keep the hosted website at 1 MB.
      serverActions: { bodySizeLimit: desktopBuild ? "10mb" : "1mb" },
    },
    async headers() {
      const securityHeaders = [
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(self), geolocation=(), microphone=(self)",
        },
      ];

      if (process.env.NODE_ENV === "production") {
        securityHeaders.push({
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        });
      }

      return [
        {
          source: "/:path*",
          headers: securityHeaders,
        },
      ];
    },
    compiler: {
      // Make the desktop-only standalone bundle identify itself correctly even
      // if a launcher update or child-process environment drops the runtime flag.
      // This replacement is server-only and is absent from hosted website builds.
      defineServer: desktopBuild
        ? { "process.env.ANW_DESKTOP_MODE": "1" }
        : undefined,
      removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
    },
  };
}

const nextConfig = createNextConfig(process.env.ANW_DESKTOP_BUILD === "1");

export default nextConfig;
