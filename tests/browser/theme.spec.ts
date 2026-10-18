import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
loadEnvConfig(process.cwd());
test("device theme, explicit preference, navigation/reload persistence, cross-tab synchronization and light printing", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/properties");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Color theme: System", exact: true })
    .click();
  await expect(
    page.getByRole("menuitemradio", {
      name: "Use device setting",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.getByRole("link", { name: "Privacy Policy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Color theme: Light", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Color theme: Light", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await second
    .getByRole("button", { name: "Color theme: Dark", exact: true })
    .click();
  await second
    .getByRole("menuitemradio", { name: "Light", exact: true })
    .click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await second.close();
  await page
    .getByRole("button", { name: "Color theme: Light", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: "Use device setting", exact: true })
    .click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ media: "print" });
  expect(await root.evaluate((e) => getComputedStyle(e).colorScheme)).toBe(
    "light",
  );
  expect(
    await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  expect(errors).toEqual([]);
});
test("owner workspace, Tiptap and menus use dark surfaces and fit phones", async ({
  page,
}) => {
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      googleVerified: true,
      sub: "theme-test",
    },
    maxAge: 3600,
  });
  await page
    .context()
    .addCookies([
      {
        name: "next-auth.session-token",
        value: token,
        url: "http://localhost:3191",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  await page.goto("/admin#leases");
  await page
    .getByRole("heading", { name: "Prepare a lease", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Color theme: System", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const colors = await page
    .locator(".owner-app")
    .evaluate((e) => ({
      bg: getComputedStyle(e).backgroundColor,
      ink: getComputedStyle(e).color,
    }));
  expect(colors.bg).not.toBe("rgb(255, 255, 255)");
  expect(colors.bg).not.toBe(colors.ink);
  await page
    .getByRole("button", { name: "Lease wording", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Lease wording", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/owner-dark-mode.png",
    fullPage: false,
  });
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { name: "Adverse-action notices", exact: true })
    .click();
  await page.getByRole("link", { name: "New notice", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Reasons for the decision", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /Choose reporting agency 1/ }).click();
  const popover = page.locator(".app-select-popover");
  await expect(popover).toBeVisible();
  expect(
    await popover.evaluate((e) => getComputedStyle(e).backgroundColor),
  ).not.toBe("rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/editor-dark-mode.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Color theme: Dark", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
