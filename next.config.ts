import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/**": ["./public/pdf-assets/fonts/*.woff"],
  },
  async headers() {
    return ["/sign/lease/:path*", "/api/lease-signing/:path*"].map(
      (source) => ({
        source,
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      }),
    );
  },
};
export default nextConfig;
