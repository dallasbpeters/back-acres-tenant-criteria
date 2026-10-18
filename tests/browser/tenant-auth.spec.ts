import { expect, test } from "@playwright/test";

const signInUrl = /\/sign-in/;

test("tenant sign-in, private-route redirects, and owner login stay separate", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tenant");
  await expect(page).toHaveURL(signInUrl);
  await expect(
    page.getByRole("button", { exact: true, name: "Continue" })
  ).toBeVisible();
  await expect(page.getByText("Payment history", { exact: true })).toHaveCount(
    0
  );
  await page.goto("/tenant/settings");
  await expect(page).toHaveURL(signInUrl);
  await page.goto("/admin/tenants");
  await expect(
    page.getByRole("button", { exact: true, name: "Continue with Google" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Connect a tenant" })
  ).toHaveCount(0);
  expect((await request.get("/api/admin/tenants")).status()).toBe(401);
  expect(
    (
      await request.post("/api/tenant", {
        data: { action: "settings", id: crypto.randomUUID(), phone: "555" },
        headers: { origin: "http://localhost:3191" },
      })
    ).status()
  ).toBe(401);
  await page.goto("/admin/payment-history");
  await expect(
    page.getByRole("button", { exact: true, name: "Continue with Google" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent invoice activity" })
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Clerk signup fits mobile and dark-mode action hover stays readable", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.addInitScript(() =>
    localStorage.setItem("back-acres-theme", "dark")
  );
  await page.goto("/sign-up");
  const action = page.getByRole("button", { exact: true, name: "Continue" });
  await expect(action).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await action.hover();
  await expect
    .poll(() =>
      action.evaluate((element) => {
        const style = getComputedStyle(element);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          return 0;
        }
        const luminance = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const channels = [...context.getImageData(0, 0, 1, 1).data]
            .slice(0, 3)
            .map((value) => {
              const normalized = value / 255;
              return normalized <= 0.040_45
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            });
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const text = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (
          (Math.max(text, background) + 0.05) /
          (Math.min(text, background) + 0.05)
        );
      })
    )
    .toBeGreaterThanOrEqual(4.5);
  await page.screenshot({
    fullPage: true,
    path: "output/clerk-tenant-sign-up-mobile-dark.png",
  });
});
