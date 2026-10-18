// biome-ignore-all lint/suspicious/useAwait: Async transport stubs intentionally preserve native promise and rejection behavior, including faults before the first await.
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

// Exercise the real SDK's transport and error decoding without external network access.
function sdk(status: number, body: unknown, headers = {}) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        headers: {
          "content-type": "application/json",
          "request-id": "req_fixture",
          ...headers,
        },
        status,
      })
  );
  const stripe = new Stripe("sk_test_isolated_fixture", {
    httpClient: Stripe.createFetchHttpClient(fetch),
    maxNetworkRetries: 0,
  });
  return { fetch, stripe };
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
      error: { message: "Provider rejected request", type },
    });
    await expect(
      stripe.checkout.sessions.retrieve("cs_fixture")
    ).rejects.toMatchObject({
      requestId: "req_fixture",
      statusCode: status,
      type: name,
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
        client_reference_id: "invoice_fixture",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: "Rent" },
              unit_amount: 125_000,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
      },
      { idempotencyKey: "fixture-stable-key" }
    );
    expect(result.id).toBe("cs_fixture");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "fixture-stable-key"
    );
    expect(
      new URLSearchParams(String(init.body)).get(
        "line_items[0][price_data][unit_amount]"
      )
    ).toBe("125000");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer sk_test_isolated_fixture"
    );
  });
  it("turns connection failures into retryable SDK errors", async () => {
    const stripe = new Stripe("sk_test_isolated_fixture", {
      httpClient: Stripe.createFetchHttpClient(async () => {
        throw new Error("connection reset");
      }),
      maxNetworkRetries: 0,
    });
    await expect(
      stripe.checkout.sessions.retrieve("cs_fixture")
    ).rejects.toMatchObject({ type: "StripeConnectionError" });
  });
  it("rejects malformed upstream JSON", async () => {
    const stripe = new Stripe("sk_test_isolated_fixture", {
      httpClient: Stripe.createFetchHttpClient(
        async () => new Response("not-json", { status: 502 })
      ),
      maxNetworkRetries: 0,
    });
    await expect(
      stripe.checkout.sessions.retrieve("cs_fixture")
    ).rejects.toMatchObject({ type: "StripeAPIError" });
  });
});
describe("Stripe connection interruptions", () => {
  it("bounds a hung request with a timeout rather than leaving checkout pending forever", async () => {
    const fetch = async (
      _url: unknown,
      init?: RequestInit
    ): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Timed out", "AbortError"))
        );
      });
    const stripe = new Stripe("sk_test_isolated_fixture", {
      httpClient: Stripe.createFetchHttpClient(fetch),
      maxNetworkRetries: 0,
      timeout: 20,
    });
    await expect(
      stripe.checkout.sessions.retrieve("cs_fixture")
    ).rejects.toMatchObject({ type: "StripeConnectionError" });
  });
});
