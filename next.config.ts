import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron starts the self-contained Next server from .next/standalone.
  // The web deployment retains its normal output mode.
  output: process.env.ANW_DESKTOP_BUILD === "1" ? "standalone" : undefined,
  // PDF.js uses this native N-API module for DOMMatrix/ImageData/Path2D in
  // Electron's local Node server. Keep the binary out of webpack's JS bundle.
  serverExternalPackages: ["@napi-rs/canvas"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.14", "192.168.1.14:3100"],
  reactStrictMode: true,
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
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
};

export default nextConfig;
