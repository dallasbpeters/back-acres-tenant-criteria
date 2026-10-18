import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { optimizePackageImports: ["@phosphor-icons/react/ssr"] },
  async headers() {
    return ["/:path*"].map((source) => ({
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Content-Security-Policy",
          // Next's inline bootstrap and Clerk styles currently require inline
          // allowances. This is a baseline policy, not nonce-based XSS protection.
          value: [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} https://clerk.backacresrentals.com https://*.clerk.accounts.dev https://*.stripe.com https://challenges.cloudflare.com https://*.protect.clerk.com https://*.posthog.com`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://img.clerk.com https://*.googleusercontent.com https://*.stripe.com",
            "font-src 'self' data:",
            "connect-src 'self' https://clerk.backacresrentals.com https://*.clerk.accounts.dev https://*.clerk.com https://*.stripe.com https://*.protect.clerk.com:* https://*.posthog.com",
            "frame-src 'self' blob: https://*.stripe.com https://*.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com",
            "worker-src 'self' blob:",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self' https://accounts.google.com https://*.stripe.com",
          ].join("; "),
        },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
      source,
    }));
  },
  outputFileTracingIncludes: {
    "/api/**": ["./public/pdf-assets/fonts/*.woff"],
  },
  reactStrictMode: true,
};
export default nextConfig;
