import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";
import { del } from "@vercel/blob";
import sharp from "sharp";
import { unzipSync, strFromU8 } from "fflate";
loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  id = crypto.randomUUID(),
  sql = neon(process.env.DATABASE_URL!);
async function cleanup() {
  const photos =
    await sql`SELECT blob_path FROM listing_photos WHERE property_id=${id}`;
  if (photos.length) await del(photos.map((p) => p.blob_path));
  await sql`DELETE FROM listing_publications WHERE property_id=${id}`;
  await sql`DELETE FROM listing_photos WHERE property_id=${id}`;
  await sql`DELETE FROM management_events WHERE entity_id=${id}`;
  await sql`DELETE FROM properties WHERE id=${id}`;
}
test.afterAll(cleanup);
test("photo upload, draft privacy, cover order, export, publication tracking and shared owner navigation", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.BLOB_READ_WRITE_TOKEN,
    "Requires the isolated listing-photo Blob store.",
  );
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect((await request.post("/api/admin/photos", { data: {} })).status()).toBe(
    401,
  );
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      sub: "fixture-owner",
      googleVerified: true,
    },
    maxAge: 3600,
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const data = {
    name: "Photo workflow verification",
    address: `1 Test St Unit ${id}`,
    description:
      "Temporary test fixture — not a rental offer.\n\nFull description ends here; this paragraph must remain visible.",
    rentCents: 100000,
    amenities: ["yard"],
    bedrooms: 2,
    bathrooms: 1,
    availableDate: "",
    contact: "fixture@example.invalid",
    published: false,
    acceptingApplications: true,
  };
  const save = (revision: number, published: boolean) =>
    page.request.post("/api/admin/management", {
      headers: { origin },
      data: { action: "property", id, revision, data: { ...data, published } },
    });
  expect((await save(0, false)).ok()).toBe(true);
  await page.goto("/admin#properties");
  await page
    .getByRole("button", { name: `Edit ${data.name}`, exact: true })
    .click();
  const amenities = page.getByRole("group", { name: "Amenities", exact: true });
  await expect(
    amenities.getByRole("checkbox", { name: "Yard", exact: true }),
  ).toBeChecked();
  await amenities.getByRole("checkbox", { name: "Patio", exact: true }).check();
  await expect(amenities.locator(".amenity-option svg")).toHaveCount(16);
  await page
    .getByRole("button", { name: "Save property", exact: true })
    .click();
  await expect
    .poll(async () => {
      const records = await (
        await page.request.get("/api/admin/management")
      ).json();
      return records.properties.find((p: { id: string }) => p.id === id)
        ?.revision;
    })
    .toBe(2);
  data.amenities.push("patio");

  expect(
    (
      await page.request.post("/api/admin/photos", {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/admin/photos", {
        headers: { origin },
        multipart: {
          propertyId: id,
          file: {
            name: "bad.svg",
            mimeType: "image/svg+xml",
            buffer: Buffer.from("<svg/>"),
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/admin/photos", {
        headers: { origin },
        multipart: {
          propertyId: id,
          file: {
            name: "disguised.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from("<svg/>"),
          },
        },
      })
    ).status(),
  ).toBe(400);
  const image = await sharp({
    create: { width: 3000, height: 1800, channels: 3, background: "#7a9c93" },
  })
    .withMetadata()
    .jpeg()
    .toBuffer();
  await page.goto(`/admin?property=${id}#publishing`);
  await expect(
    page.getByRole("heading", { name: "Photos & publishing", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Upload listing photos").setInputFiles([
    { name: "one.jpg", mimeType: "image/jpeg", buffer: image },
    { name: "two.jpg", mimeType: "image/jpeg", buffer: image },
  ]);
  await expect(page.getByText("Photos uploaded.", { exact: true })).toBeVisible(
    { timeout: 45000 },
  );
  const records = async () =>
    (await page.request.get("/api/admin/management")).json();
  let photos = (await records()).photos.filter(
    (p: { propertyId: string }) => p.propertyId === id,
  );
  expect(photos).toHaveLength(2);
  expect((await request.get(photos[0].url)).status()).toBe(404);
  const privateImage = await page.request.get(photos[0].url);
  expect(privateImage.ok()).toBe(true);
  const metadata = await sharp(await privateImage.body()).metadata();
  expect(metadata.width).toBeLessThanOrEqual(2400);
  expect(metadata.exif).toBeUndefined();
  await page.getByLabel("Caption for photo 1").fill("Fixture exterior");
  await page.getByLabel("Caption for photo 1").blur();
  await expect
    .poll(
      async () =>
        (await records()).photos.find(
          (p: { id: string }) => p.id === photos[0].id,
        ).caption,
    )
    .toBe("Fixture exterior");
  const gallery = page.getByRole("region", {
    name: "Listing photos",
    exact: true,
  });
  const first = gallery.getByRole("button", {
    name: "Reorder photo 1",
    exact: true,
  });
  const second = gallery.getByRole("button", {
    name: "Reorder photo 2",
    exact: true,
  });
  await page.mouse.move(0, 0);
  await expect(
    gallery.getByRole("button", { name: "Remove photo 1", exact: true }),
  ).toHaveCSS("opacity", "0");
  await expect(first).toBeEnabled();
  await first.hover();
  await expect(
    gallery.getByRole("button", { name: "Remove photo 1", exact: true }),
  ).toHaveCSS("opacity", "1");
  const from = (await first.boundingBox())!,
    to = (await second.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await records()).photos.filter(
          (p: { propertyId: string; archived: boolean }) =>
            p.propertyId === id && !p.archived,
        )[0].id,
    )
    .toBe(photos[1].id);
  await page
    .getByRole("button", { name: /Zillow Rental Manager publishing status/ })
    .click();
  await page
    .getByRole("option", { name: "Live — confirmed by me", exact: true })
    .click();
  await expect(
    page.getByText("Publishing status saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(gallery.locator(".photo-edit-item").first()).toHaveAttribute(
    "data-photo-id",
    photos[1].id,
  );
  await page.screenshot({
    path: "test-results/photo-before-keyboard.png",
    fullPage: true,
  });
  // Keyboard users can reorder and cancel without a pointer.
  await first.focus();
  await page.keyboard.press("Space");
  await expect(gallery.locator(".photo-dragging")).toHaveCount(1);
  // Let the drag library measure the grid before sending a direction key.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      gallery
        .locator(".photo-dragging")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41),
    )
    .toBeGreaterThan(1);
  await page.keyboard.press("Space");
  await expect
    .poll(
      async () =>
        (await records()).photos.filter(
          (p: { propertyId: string; archived: boolean }) =>
            p.propertyId === id && !p.archived,
        )[0].id,
    )
    .toBe(photos[0].id);
  await expect(second).toBeEnabled();
  await second.focus();
  await page.keyboard.press("Space");
  await expect(gallery.locator(".photo-dragging")).toHaveCount(1);
  // Let the drag library measure the grid before sending a direction key.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() =>
      gallery
        .locator(".photo-dragging")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41),
    )
    .toBeLessThan(-1);
  await page.keyboard.press("Space");
  await expect
    .poll(
      async () =>
        (await records()).photos.filter(
          (p: { propertyId: string; archived: boolean }) =>
            p.propertyId === id && !p.archived,
        )[0].id,
    )
    .toBe(photos[1].id);
  await first.focus();
  await page.keyboard.press("Space");
  await expect(gallery.locator(".photo-dragging")).toHaveCount(1);
  // Let the drag library measure the grid before sending a direction key.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      gallery
        .locator(".photo-dragging")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41),
    )
    .toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await expect(gallery.locator(".photo-edit-item").first()).toHaveAttribute(
    "data-photo-id",
    photos[1].id,
  );
  await first.hover();
  await page.screenshot({
    path: "test-results/photo-gallery-drag-and-drop.png",
    fullPage: true,
  });
  await page.getByLabel("Caption for photo 1").fill("Updated cover caption");
  await page.getByLabel("Caption for photo 1").blur();
  await expect(
    page.getByText(
      "Listing details or photos changed. Update this site, then confirm its status again.",
    ),
  ).toBeVisible();
  expect((await request.get(`/api/admin/listings/${id}/export`)).status()).toBe(
    401,
  );
  const exported = await page.request.get(`/api/admin/listings/${id}/export`);
  expect(exported.ok()).toBe(true);
  const files = unzipSync(await exported.body());
  expect(
    Object.keys(files).filter((p) => p.startsWith("photos/")),
  ).toHaveLength(2);
  expect(strFromU8(files["listing.txt"])).toContain(data.address);
  expect(strFromU8(files["listing.txt"])).toContain("Amenities: Yard, Patio");
  expect(strFromU8(files["READ-ME.txt"])).toContain(
    "Nothing has been submitted",
  );
  await gallery
    .getByRole("button", { name: "Remove photo 2", exact: true })
    .focus();
  await expect(
    gallery.getByRole("button", { name: "Remove photo 2", exact: true }),
  ).toHaveCSS("opacity", "1");
  await gallery
    .getByRole("button", { name: "Remove photo 2", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await records()).photos.find(
          (p: { id: string }) => p.id === photos[0].id,
        ).archived,
    )
    .toBe(true);
  await page.getByText("Removed photos (1)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Restore photo", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await records()).photos.find(
          (p: { id: string }) => p.id === photos[0].id,
        ).archived,
    )
    .toBe(false);
  await page.emulateMedia({ media: "screen" });
  const mobile = await page
    .context()
    .browser()!
    .newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
  await mobile.addCookies(await page.context().cookies());
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`/admin?property=${id}#publishing`);
  await expect(
    mobilePage.getByRole("button", { name: "Remove photo 1", exact: true }),
  ).toHaveCSS("opacity", "1");
  expect(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await mobile.close();
  expect((await save(2, true)).ok()).toBe(true);
  expect((await request.get(photos[0].url)).ok()).toBe(true);
  const property = (await records()).properties.find(
    (p: { id: string }) => p.id === id,
  );
  await page.goto(`/properties/${property.slug}`);
  await expect(page.locator("#property-overview")).toHaveCSS(
    "border-bottom-width",
    "0px",
  );
  await expect(page.locator("#property-about")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(page.locator("#property-amenities li")).toHaveCount(2);
  await expect(page.locator("#property-amenities li svg")).toHaveCount(2);
  await expect(page.locator("#property-amenities")).toContainText("Yard");
  await expect(page.locator("#property-amenities")).toContainText("Patio");

  await expect(
    page.getByRole("region", { name: "Property photos" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View photo 2: Fixture exterior" })
    .click();
  await expect(
    page.getByRole("img", { name: "Fixture exterior", exact: true }),
  ).toBeVisible();
  const viewer = page.getByRole("dialog", { name: `${data.name} · Photos` });
  await expect(viewer).toBeVisible();
  const closePhotos = viewer.getByRole("button", {
    name: "Close photos",
    exact: true,
  });
  await expect(closePhotos.locator("svg")).toHaveCount(1);
  await expect(closePhotos).toHaveText("");
  await expect(closePhotos).toHaveCSS("border-top-width", "0px");

  await expect(viewer.getByText("Photo 2 of 2", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("Photo 1 of 2", { exact: true })).toBeVisible();
  await viewer
    .getByRole("button", { name: "Previous photo", exact: true })
    .click();
  await expect(viewer.getByText("Photo 2 of 2", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(viewer).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "View photo 2: Fixture exterior" }),
  ).toBeFocused();
  await expect(
    page.getByText(
      "Full description ends here; this paragraph must remain visible.",
      { exact: true },
    ),
  ).toBeVisible();
  for (const mode of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: mode });
    const apply = page.getByRole("link", {
      name: "Apply for this property",
      exact: true,
    });
    const ink = await apply.evaluate((e) => getComputedStyle(e).color);
    await apply.hover();
    await page.waitForTimeout(180);
    expect(await apply.evaluate((e) => getComputedStyle(e).color)).toBe(ink);
  }
  await page.goto("/properties");
  await expect(
    page.getByText(
      "Full description ends here; this paragraph must remain visible.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Owner workspace", exact: true }),
  ).toBeVisible();
  const visitor = await request.get("/properties");
  expect(await visitor.text()).not.toContain('href="/admin"');
  const signedOutAdmin = await request.get("/admin");
  expect(await signedOutAdmin.text()).not.toContain(">Workspace</a>");
  expect(
    (
      await page.request.patch("/api/admin/photos", {
        headers: { origin },
        data: { action: "archive", id: photos[0].id, archived: true },
      })
    ).ok(),
  ).toBe(true);
  expect((await request.get(photos[0].url)).status()).toBe(404);
  expect(
    (
      await page.request.patch("/api/admin/photos", {
        headers: { origin },
        data: { action: "archive", id: photos[0].id, archived: false },
      })
    ).ok(),
  ).toBe(true);
  expect((await save(3, false)).ok()).toBe(true);
  expect((await request.get(photos[0].url)).status()).toBe(404);
  await cleanup();
  await page.goto("/admin/adverse-actions/new");
  await page
    .getByLabel("Applicant full name", { exact: true })
    .fill("Unsaved fixture");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Account navigation" })
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(
    page.getByLabel("Applicant full name", { exact: true }),
  ).toHaveValue("Unsaved fixture");
  expect((await page.request.get("/api/admin/management")).ok()).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New notice", exact: true }).click();
  await expect(
    page.getByLabel("Applicant full name", { exact: true }),
  ).toHaveValue("");
  await expect(
    page
      .getByRole("navigation", { name: "Account navigation" })
      .getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "Account navigation" })
      .getByRole("link", { name: "Workspace", exact: true }),
  ).toHaveAttribute("href", "/admin");
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { name: "Properties", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Properties", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/owner-workspace-updated.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
