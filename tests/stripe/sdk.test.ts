import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
// Exercise the real SDK's transport and error decoding without external network access.
function sdk(status: number, body: unknown, headers = {}) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "content-type": "application/json",
          "request-id": "req_fixture",
          ...headers,
        },
      }),
  );
  const stripe = new Stripe("sk_test_isolated_fixture", {
    httpClient: Stripe.createFetchHttpClient(fetch),
    maxNetworkRetries: 0,
  });
  return { stripe, fetch };
}
describe("Stripe SDK transport boundary", () => {
  it.each([
    [400, "invalid_request_error", "StripeInvalidRequestError"],
    [401, "authentication_error", "StripeAuthenticationError"],
    [403, "permission_error", "StripePermissionError"],
    [429, "rate_limit_error", "StripeRateLimitError"],
    [500, "api_error", "StripeAPIError"],
  ])("decodes HTTP %s as %s", async (status, type, name) => {
    const { stripe, fetch } = sdk(status as number, {
      error: { type, message: "Provider rejected request" },
    });
    await expect(
      stripe.checkout.sessions.retrieve("cs_fixture"),
    ).rejects.toMatchObject({
      type: name,
      statusCode: status,
      requestId: "req_fixture",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("sends the expected endpoint, authorization and idempotency key", async () => {
    const { stripe, fetch } = sdk(200, {
      id: "cs_fixture",
      object: "checkout.session",
      status: "open",
      url: "https://checkout.stripe.com/fixture",
    });
    const result = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: 125000,
              product_data: { name: "Rent" },
            },
          },
        ],
        client_reference_id: "invoice_fixture",
      },
      { idempotencyKey: "fixture-stable-key" },
    );
    expect(result.id).toBe("cs_fixture");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "fixture-stable-key",
    );
    expect(
      new URLSearchParams(String(init.body)).get(
        "line_items[0][price_data][unit_amount]",
      ),
    ).toBe("125000");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer sk_test_isolated_fixture",
    );
  });
  it("turns connection failures into retryable SDK errors", async () => {
    const stripe = new Stripe("sk_test_isolated_fixture", {
      maxNetworkRetries: 0,
      httpClient: Stripe.createFetchHttpClient(async () => {
        throw Error("connection reset");
      }),
    });
    await expect(
      stripe.checkout.sessions.retrieve("cs_fixture"),
    ).rejects.toMatchObject({ type: "StripeConnectionError" });
  });
  it("rejects malformed upstream JSON", async () => {
    const stripe = new Stripe("sk_test_isolated_fixture", {
      maxNetworkRetries: 0,
      httpClient: Stripe.createFetchHttpClient(
        async () => new Response("not-json", { status: 502 }),
      ),
    });
    await expect(
      stripe.checkout.sessions.retrieve("cs_fixture"),
    ).rejects.toMatchObject({ type: "StripeAPIError" });
  });
});
describe("Stripe connection interruptions", () => {
  it("bounds a hung request with a timeout rather than leaving checkout pending forever", async () => {
    const fetch = async (
      _url: unknown,
      init?: RequestInit,
    ): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Timed out", "AbortError")),
        );
      });
    const stripe = new Stripe("sk_test_isolated_fixture", {
      timeout: 20,
      maxNetworkRetries: 0,
      httpClient: Stripe.createFetchHttpClient(fetch),
    });
    await expect(
      stripe.checkout.sessions.retrieve("cs_fixture"),
    ).rejects.toMatchObject({ type: "StripeConnectionError" });
  });
});
