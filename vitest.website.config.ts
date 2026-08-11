import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const desktopOnlyPatterns = [
  "desktop/**",
  "src/lib/desktop/**",
  "src/app/api/desktop/**",
  "src/app/presenter/desktop-*.ts",
  "src/components/desktop-*.tsx",
  "src/lib/presentation/lan-remote-static.test.ts",
  "src/lib/presentation/use-desktop-remote-channel.test.tsx",
  "src/lib/presentation/use-desktop-remote-channel.ts",
  "src/types/anointed-desktop.d.ts",
  "src/types/node-sqlite.d.ts",
];

// The 80% unit gate covers deterministic website business logic, authorization
// helpers, server boundaries, and the Bible proxy. React pages and browser/device
// adapters are exercised by the Playwright desktop/mobile route journeys instead.
const websiteUnitCoverageSurface = [
  "src/app/api/bible/route.ts",
  "src/lib/detect-key-from-chords.ts",
  "src/lib/rate-limit.ts",
  "src/lib/domain/attendance.ts",
  "src/lib/domain/arrangements.ts",
  "src/lib/domain/chords.ts",
  "src/lib/domain/files.ts",
  "src/lib/domain/join-requests.ts",
  "src/lib/domain/post-login.ts",
  "src/lib/domain/presentation.ts",
  "src/lib/domain/rbac.ts",
  "src/lib/domain/setlist-readiness.ts",
  "src/lib/domain/setlists.ts",
  "src/lib/domain/team-code.ts",
  "src/lib/domain/time.ts",
  "src/lib/domain/validators.ts",
  "src/lib/presentation/control-protocol.ts",
  "src/lib/presentation/live-snapshot.ts",
  "src/lib/presentation/lyric-shortcuts.ts",
  "src/lib/presentation/remote-pairing.ts",
  "src/lib/server/cron-auth.ts",
  "src/lib/server/safe-error.ts",
  "src/lib/server/safe-remote-html.ts",
  "src/lib/supabase/env.ts",
  "src/lib/supabase/team-context.ts",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", ...desktopOnlyPatterns],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: websiteUnitCoverageSurface,
      exclude: desktopOnlyPatterns,
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
