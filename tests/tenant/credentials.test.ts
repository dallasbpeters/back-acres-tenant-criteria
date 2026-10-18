import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tenantAuthReady } from "../../lib/tenant/config";
import { clerkSecretKey } from "../../lib/tenant/credentials";

const connect = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("@vercel/connect", () => ({ getToken: connect.getToken }));
beforeEach(() => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("CLERK_AUTH_SOURCE", "");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_local_fixture");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_ENCRYPTION_KEY", "fixture-encryption-key");
  connect.getToken.mockReset().mockResolvedValue("sk_test_connected_fixture");
});
afterEach(() => vi.unstubAllEnvs());
describe("Vercel Connect Clerk credentials", () => {
  it("uses the existing local development key without contacting Connect", async () => {
    expect(await clerkSecretKey()).toBe("sk_test_local_fixture");
    expect(connect.getToken).not.toHaveBeenCalled();
  });
  it.each(["VERCEL", "CLERK_AUTH_SOURCE"])(
    "uses the app-scoped connector with %s",
    async (variable) => {
      vi.stubEnv(variable, variable === "VERCEL" ? "1" : "vercel-connect");
      expect(await clerkSecretKey()).toBe("sk_test_connected_fixture");
      expect(connect.getToken).toHaveBeenCalledExactlyOnceWith(
        "clerk/back-acres",
        { subject: { type: "app" } }
      );
    }
  );
  it("does not fall back to the environment secret during a Connect outage", async () => {
    vi.stubEnv("VERCEL", "1");
    connect.getToken.mockRejectedValue(new Error("Connection unavailable"));
    await expect(clerkSecretKey()).rejects.toThrow("Connection unavailable");
  });
  it.each([
    "pk_test_public_fixture",
    "ak_platform_fixture",
    "",
    "Bearer sk_test_fixture",
  ])("rejects a credential of the wrong type", async (credential) => {
    vi.stubEnv("VERCEL", "1");
    connect.getToken.mockResolvedValue(credential);
    await expect(clerkSecretKey()).rejects.toThrow("application secret key");
  });
  it("rejects mismatched test and production keys", async () => {
    vi.stubEnv("VERCEL", "1");
    connect.getToken.mockResolvedValue("sk_live_fixture");
    await expect(clerkSecretKey()).rejects.toThrow("same environment");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_fixture");
    expect(await clerkSecretKey()).toBe("sk_live_fixture");
  });
  it("requires an encryption key for Connect's dynamic credentials", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("CLERK_ENCRYPTION_KEY", "");
    expect(tenantAuthReady()).toBe(false);
    vi.stubEnv("CLERK_ENCRYPTION_KEY", "fixture-encryption-key");
    expect(tenantAuthReady()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    expect(tenantAuthReady()).toBe(false);
  });
});
