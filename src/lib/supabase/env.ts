export function isForcedDemo() {
  return (
    process.env.E2E_FORCE_DEMO === "1" ||
    process.env.NEXT_PUBLIC_E2E_FORCE_DEMO === "1"
  );
}

export function hasSupabaseEnv() {
  if (isForcedDemo()) return false;

  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseEnv() {
  if (isForcedDemo()) {
    throw new Error("Supabase is disabled in forced demo mode.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return { url, publishableKey };
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS.");
  }
  return url.origin;
}
