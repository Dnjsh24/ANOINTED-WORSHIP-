const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl || !publishableKey) {
  console.error(
    "Missing public Supabase configuration. Run with: node --env-file=.env.local test-db.mjs",
  );
  process.exitCode = 1;
} else {
  const healthUrl = new URL("/auth/v1/health", supabaseUrl);

  try {
    const response = await fetch(healthUrl, {
      headers: {
        apikey: publishableKey,
      },
      signal: AbortSignal.timeout(5_000),
    });

    console.log(
      JSON.stringify({
        reachable: response.ok,
        status: response.status,
      }),
    );

    if (!response.ok) {
      process.exitCode = 1;
    }
  } catch {
    console.error("Supabase health check failed.");
    process.exitCode = 1;
  }
}
