import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  allow: vi.fn(),
  guard: vi.fn(),
  mail: vi.fn(),
  session: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: state.session }));
vi.mock("@/lib/adverse/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/adverse/auth")>()),
  guard: state.guard,
}));
vi.mock("@/lib/management/security", () => ({ allowIntake: state.allow }));
vi.mock("@/lib/leases/mail", () => ({ sendLeaseMail: state.mail }));

import { POST } from "../../app/api/admin/email-test/route";

const request = () =>
  new NextRequest("https://rental.example.invalid/api/admin/email-test", {
    body: JSON.stringify({
      subject: "Not allowed",
      to: "untrusted@example.invalid",
    }),
    method: "POST",
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.guard.mockResolvedValue(null);
  state.session.mockResolvedValue({ user: { email: "owner@example.invalid" } });
  state.allow.mockResolvedValue(true);
  state.mail.mockResolvedValue(
    new Response(JSON.stringify({ id: "test-delivery-id" }), { status: 200 })
  );
  vi.stubEnv("RESEND_API_KEY", "test-private-key");
  vi.stubEnv("FROM_EMAIL", "Back Acres Rentals <noreply@backacresrentals.com>");
});
afterEach(() => vi.unstubAllEnvs());
describe("owner-only email delivery test", () => {
  it.each([401, 403])(
    "preserves guard rejection %s without sending",
    async (status) => {
      state.guard.mockResolvedValue(new Response(null, { status }));
      expect((await POST(request())).status).toBe(status);
      expect(state.mail).not.toHaveBeenCalled();
      expect(state.session).not.toHaveBeenCalled();
    }
  );
  it("fails closed when the authenticated recipient is missing", async () => {
    state.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(state.mail).not.toHaveBeenCalled();
  });
  it.each(["FROM_EMAIL", "RESEND_API_KEY"])("requires %s", async (key) => {
    vi.stubEnv(key, "");
    expect((await POST(request())).status).toBe(503);
    expect(state.mail).not.toHaveBeenCalled();
  });
  it("does not allow arbitrary recipients or content from the request", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      id: "test-delivery-id",
      recipient: "owner@example.invalid",
      sender: "Back Acres Rentals <noreply@backacresrentals.com>",
    });
    expect(JSON.stringify(result)).not.toContain("test-private-key");
    expect(state.mail).toHaveBeenCalledWith({
      subject: "Back Acres Rentals — email delivery test",
      text: expect.stringContaining("It does not create a lease"),
      to: "owner@example.invalid",
    });
  });
  it("limits repeated sends before contacting Resend", async () => {
    state.allow.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(state.mail).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])(
    "reports provider HTTP %s without exposing its response",
    async (status) => {
      state.mail.mockResolvedValue(
        new Response("private provider detail", { status })
      );
      const response = await POST(request());
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("private provider detail");
    }
  );
  it("treats an absent provider message ID as unconfirmed", async () => {
    state.mail.mockResolvedValue(new Response("{}"));
    expect((await POST(request())).status).toBe(502);
  });
  it("fails closed on database failure before sending", async () => {
    state.allow.mockRejectedValue(new Error("private database detail"));
    expect((await POST(request())).status).toBe(503);
    expect(state.mail).not.toHaveBeenCalled();
  });
  it("does not expose a timeout or transport credential", async () => {
    state.mail.mockRejectedValue(new Error("private credential"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private credential");
  });
});
