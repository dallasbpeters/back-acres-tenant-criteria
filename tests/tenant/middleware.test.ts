import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import middleware, { config } from "../../middleware";

const state = vi.hoisted(() => ({ options: vi.fn(), secret: vi.fn() }));
vi.mock("@/lib/tenant/credentials", () => ({ clerkSecretKey: state.secret }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (options?: unknown) => {
    if (options) {
      state.options(options);
    }
    return () => NextResponse.next();
  },
}));
const request = () => new NextRequest("https://rental.example.invalid/tenant");
const event = {} as Parameters<typeof middleware>[1];
beforeEach(() => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_ENCRYPTION_KEY", "fixture-encryption-key");
  vi.clearAllMocks();
  state.secret.mockResolvedValue("sk_test_connected_fixture");
});
afterEach(() => vi.unstubAllEnvs());
describe("connected Clerk middleware", () => {
  it("passes the connected credential only to Clerk middleware", async () => {
    const response = await middleware(request(), event);
    expect(response?.status).toBe(200);
    expect(state.options).toHaveBeenCalledWith({
      secretKey: "sk_test_connected_fixture",
    });
    expect(JSON.stringify([...(response?.headers ?? [])])).not.toContain(
      "sk_test_connected_fixture"
    );
  });
  it("returns a generic 503 without leaking Connect errors or falling through", async () => {
    state.secret.mockRejectedValue(new Error("Sensitive provider detail"));
    const response = await middleware(request(), event);
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain("Sensitive provider detail");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(state.options).not.toHaveBeenCalled();
  });
  it("does not contact Connect before encryption is configured", async () => {
    vi.stubEnv("CLERK_ENCRYPTION_KEY", "");
    await middleware(request(), event);
    expect(state.secret).not.toHaveBeenCalled();
  });
  it("keeps owner APIs and Stripe webhooks outside Clerk's matcher", () => {
    expect(config.matcher).toEqual([
      "/tenant/:path*",
      "/sign-in/:path*",
      "/sign-up/:path*",
      "/api/tenant/:path*",
    ]);
  });
});
