import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { optimizePackageImports: ["@phosphor-icons/react/ssr"] },
  async headers() {
    return ["/sign/lease/:path*", "/api/lease-signing/:path*"].map(
      (source) => ({
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
        source,
      })
    );
  },
  outputFileTracingIncludes: {
    "/api/**": ["./public/pdf-assets/fonts/*.woff"],
  },
  reactStrictMode: true,
};
export default nextConfig;
