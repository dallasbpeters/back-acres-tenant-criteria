import posthog from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    defaults: "2026-05-30",
  });
} else if (process.env.NODE_ENV === "development") {
  // Warn instead of throwing: a missing analytics setting must not break pages,
  // and the isolated browser tests intentionally run without PostHog.
  console.warn(
    "PostHog analytics is off: set NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST."
  );
}
