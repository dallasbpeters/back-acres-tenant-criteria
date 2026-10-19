// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.
import { requireValue } from "@/lib/required";

const pattern1 = /Choose reporting agency 1/;
const pattern2 = /ui-button--primary/;
const pattern3 =
  /Confirm I have read the criteria|Not accepting acknowledgments yet/;

import { loadEnvConfig } from "@next/env";
import { expect, type Locator, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

loadEnvConfig(process.cwd());

async function expectReadable(locator: Locator) {
  const contrast = await locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Expected a 2D canvas context");
    }
    const luminance = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = [...context.getImageData(0, 0, 1, 1).data]
        .slice(0, 3)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.040_45
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    let surface: Element | null = element;
    while (
      surface &&
      getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)"
    ) {
      surface = surface.parentElement;
    }
    const ink = luminance(getComputedStyle(element).color);
    const paper = luminance(
      getComputedStyle(surface ?? document.body).backgroundColor
    );
    return (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

test("stored theme applies before hydration", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() =>
    localStorage.setItem("back-acres-theme", "dark")
  );
  await page.route("**/_next/**/*.js*", (route) => route.abort());
  await page.goto("/properties");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // The unhydrated control retains its server label, proving the provider hasn't run.
  await expect(
    page.getByRole("button", { exact: true, name: "Color theme: System" })
  ).toBeVisible();
});

for (const storage of ["invalid", "blocked"] as const) {
  test(`${storage} storage falls back to device theme and allows a current-page choice`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript((mode) => {
      if (mode === "invalid") {
        localStorage.setItem("back-acres-theme", "unknown");
      } else {
        Object.defineProperty(Storage.prototype, "getItem", {
          value() {
            throw new DOMException("Blocked", "SecurityError");
          },
        });
        Object.defineProperty(Storage.prototype, "setItem", {
          value() {
            throw new DOMException("Blocked", "SecurityError");
          },
        });
      }
    }, storage);
    await page.goto("/properties");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page
      .getByRole("button", { exact: true, name: "Color theme: System" })
      .click();
    await page
      .getByRole("menuitemradio", { exact: true, name: "Light" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(
      page.getByRole("button", { exact: true, name: "Color theme: Light" })
    ).toBeVisible();
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
}
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
    .getByRole("button", { exact: true, name: "Color theme: System" })
    .click();
  await expect(
    page.getByRole("menuitemradio", {
      exact: true,
      name: "Use device setting",
    })
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { exact: true, name: "Light" }).click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.getByRole("link", { exact: true, name: "Privacy Policy" }).click();
  await expect(
    page.getByRole("button", { exact: true, name: "Color theme: Light" })
  ).toBeVisible();
  await page
    .getByRole("button", { exact: true, name: "Color theme: Light" })
    .click();
  await page.getByRole("menuitemradio", { exact: true, name: "Dark" }).click();
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await second
    .getByRole("button", { exact: true, name: "Color theme: Dark" })
    .click();
  await second
    .getByRole("menuitemradio", { exact: true, name: "Light" })
    .click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await second.close();
  await page
    .getByRole("button", { exact: true, name: "Color theme: Light" })
    .click();
  await page
    .getByRole("menuitemradio", { exact: true, name: "Use device setting" })
    .click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ media: "print" });
  expect(await root.evaluate((e) => getComputedStyle(e).colorScheme)).toBe(
    "light"
  );
  expect(
    await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor)
  ).toBe("rgb(255, 255, 255)");
  expect(errors).toEqual([]);
});
test("owner workspace, Tiptap and menus use dark surfaces and fit phones", async ({
  page,
}) => {
  const token = await encode({
    maxAge: 3600,
    secret: requireValue(
      process.env.NEXTAUTH_SECRET,
      "Expected process.env.NEXTAUTH_SECRET"
    ),
    token: {
      email: requireValue(
        process.env.ADMIN_EMAILS,
        "Expected process.env.ADMIN_EMAILS"
      ).split(",")[0],
      googleVerified: true,
      sub: "theme-test",
    },
  });
  await page.context().addCookies([
    {
      httpOnly: true,
      name: "next-auth.session-token",
      sameSite: "Lax",
      url: "http://localhost:3191",
      value: token,
    },
  ]);
  await page.goto("/admin#leases");
  await page.getByRole("heading", { exact: true, name: "Leases" }).waitFor();
  await page
    .getByRole("button", { exact: true, name: "Color theme: System" })
    .click();
  await page.getByRole("menuitemradio", { exact: true, name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const colors = await page.locator(".owner-app").evaluate((e) => ({
    bg: getComputedStyle(e).backgroundColor,
    ink: getComputedStyle(e).color,
  }));
  expect(colors.bg).not.toBe("rgb(255, 255, 255)");
  expect(colors.bg).not.toBe(colors.ink);
  await page
    .getByRole("button", { exact: true, name: "Lease wording" })
    .click();
  await page
    .getByRole("textbox", { exact: true, name: "Lease wording" })
    .waitFor();
  await expectReadable(
    page.getByRole("textbox", { exact: true, name: "Lease wording" })
  );
  await page.screenshot({
    fullPage: false,
    path: "test-results/owner-dark-mode.png",
  });
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { exact: true, name: "Adverse-action notices" })
    .click();
  await page.getByRole("link", { exact: true, name: "New notice" }).click();
  await page
    .getByRole("textbox", { exact: true, name: "Reasons for the decision" })
    .waitFor();
  await page
    .getByRole("textbox", { exact: true, name: "Reasons for the decision" })
    .fill("The verified application did not meet the published criteria.");
  await expectReadable(
    page.getByRole("textbox", {
      exact: true,
      name: "Reasons for the decision",
    })
  );
  await page.getByRole("button", { name: pattern1 }).click();
  const popover = page.locator(".app-select-popover");
  await expect(popover).toBeVisible();
  expect(
    await popover.evaluate((e) => getComputedStyle(e).backgroundColor)
  ).not.toBe("rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await page.screenshot({
    fullPage: false,
    path: "test-results/editor-dark-mode.png",
  });
  await page
    .getByRole("button", { exact: true, name: "Preview notice" })
    .click();
  const preview = page.getByRole("article", {
    exact: true,
    name: "Notice preview",
  });
  await expect(preview).toContainText("The verified application did not meet");
  await page.screenshot({
    fullPage: false,
    path: "test-results/notice-preview-dark-mode.png",
  });
  await expectReadable(preview.locator("article > p").first());
  await page.setViewportSize({ height: 844, width: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page
    .getByRole("button", { exact: true, name: "Color theme: Dark" })
    .click();
  await page.getByRole("menuitemradio", { exact: true, name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectReadable(preview.locator("article > p").first());
  await page.getByRole("button", { exact: true, name: "Edit notice" }).click();
  await expectReadable(
    page.getByRole("textbox", {
      exact: true,
      name: "Reasons for the decision",
    })
  );
  await page.goto("/admin#leases");
  await page
    .getByRole("button", { exact: true, name: "Lease wording" })
    .click();
  await expectReadable(
    page.getByRole("textbox", { exact: true, name: "Lease wording" })
  );
});

test("shared buttons keep readable hover, keyboard focus and disabled states in both themes", async ({
  page,
}) => {
  const token = await encode({
    maxAge: 3600,
    secret: requireValue(
      process.env.NEXTAUTH_SECRET,
      "Expected process.env.NEXTAUTH_SECRET"
    ),
    token: {
      email: requireValue(
        process.env.ADMIN_EMAILS,
        "Expected process.env.ADMIN_EMAILS"
      ).split(",")[0],
      googleVerified: true,
      sub: "button-theme-test",
    },
  });
  await page.context().addCookies([
    {
      httpOnly: true,
      name: "next-auth.session-token",
      sameSite: "Lax",
      url: "http://localhost:3191",
      value: token,
    },
  ]);
  await page.setViewportSize({ height: 900, width: 1440 });
  const background = (locator: Locator) =>
    locator.evaluate((e) => getComputedStyle(e).backgroundColor);
  for (const mode of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: mode });
    await page.goto("/admin#branding");
    const primary = page.getByRole("button", {
        exact: true,
        name: "Save branding",
      }),
      secondary = page.getByRole("button", { exact: true, name: "Sign out" });
    await expect(primary).toHaveClass(pattern2);
    await expectReadable(primary);
    await expectReadable(secondary);
    const resting = await background(primary);
    await primary.hover();
    await expect.poll(() => background(primary)).not.toBe(resting);
    await expectReadable(primary);
    const secondaryResting = await background(secondary);
    await secondary.hover();
    await expect.poll(() => background(secondary)).not.toBe(secondaryResting);
    await expectReadable(secondary);
    await page
      .getByRole("button", { exact: true, name: "Color theme: System" })
      .focus();
    await page.keyboard.press("Tab");
    await expect(secondary).toBeFocused();
    expect(await secondary.getAttribute("data-focus-visible")).not.toBeNull();
    expect(
      await secondary.evaluate((e) => getComputedStyle(e).outlineStyle)
    ).toBe("solid");
    if (mode === "dark") {
      await page.screenshot({
        fullPage: false,
        path: "test-results/buttons-dark-mode.png",
      });
    }
    await page.goto("/");
    const disabled = page.getByRole("button", {
      name: pattern3,
    });
    await expect(disabled).toBeDisabled();
    await expectReadable(disabled);
    const disabledResting = await background(disabled);
    await disabled.hover();
    expect(await background(disabled)).toBe(disabledResting);
  }
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/admin#branding");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await expectReadable(
    page.getByRole("button", { exact: true, name: "Save branding" })
  );
});
