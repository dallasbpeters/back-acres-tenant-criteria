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
  await expect(action).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.screenshot({
    fullPage: true,
    path: "output/clerk-tenant-sign-up-mobile-dark.png",
  });
});
