export async function register() {
  // The OTLP HTTP exporter needs Node APIs; the Edge runtime skips server logs.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const [{ logs }, { posthogLoggerProvider }] = await Promise.all([
    import("@opentelemetry/api-logs"),
    import("@/lib/posthog-logs"),
  ]);
  if (posthogLoggerProvider) {
    logs.setGlobalLoggerProvider(posthogLoggerProvider);
  }
}
