// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.
import { requireValue } from "@/lib/required";

const pattern1 = /Zillow Rental Manager publishing status/;

import { neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { del } from "@vercel/blob";
import { strFromU8, unzipSync } from "fflate";
import { encode } from "next-auth/jwt";
import sharp from "sharp";

loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  id = crypto.randomUUID(),
  sql = neon(
    requireValue(process.env.DATABASE_URL, "Expected process.env.DATABASE_URL")
  );
async function cleanup() {
  const photos =
    await sql`SELECT blob_path FROM listing_photos WHERE property_id=${id}`;
  if (photos.length) {
    await del(photos.map((p) => p.blob_path));
  }
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
    "Requires the isolated listing-photo Blob store."
  );
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect((await request.post("/api/admin/photos", { data: {} })).status()).toBe(
    401
  );
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
      sub: "fixture-owner",
    },
  });
  await page.context().addCookies([
    {
      httpOnly: true,
      name: "next-auth.session-token",
      sameSite: "Lax",
      url: origin,
      value: token,
    },
  ]);
  const data = {
    acceptingApplications: true,
    address: `1 Test St Unit ${id}`,
    amenities: ["yard"],
    availableDate: "",
    bathrooms: 1,
    bedrooms: 2,
    contact: "fixture@example.invalid",
    description:
      "Temporary test fixture — not a rental offer.\n\nFull description ends here; this paragraph must remain visible.",
    name: "Photo workflow verification",
    published: false,
    rentCents: 100_000,
  };
  const save = (revision: number, published: boolean) =>
    page.request.post("/api/admin/management", {
      data: { action: "property", data: { ...data, published }, id, revision },
      headers: { origin },
    });
  expect((await save(0, false)).ok()).toBe(true);
  await page.goto("/admin#properties");
  await page
    .getByRole("button", { exact: true, name: `Edit ${data.name}` })
    .click();
  const amenities = page.getByRole("group", { exact: true, name: "Amenities" });
  await expect(
    amenities.getByRole("checkbox", { exact: true, name: "Yard" })
  ).toBeChecked();
  await amenities.getByRole("checkbox", { exact: true, name: "Patio" }).check();
  await expect(amenities.locator(".amenity-option svg")).toHaveCount(16);
  await page
    .getByRole("button", { exact: true, name: "Save property" })
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
        data: {},
        headers: { origin: "https://evil.example" },
      })
    ).status()
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/admin/photos", {
        headers: { origin },
        multipart: {
          file: {
            buffer: Buffer.from("<svg/>"),
            mimeType: "image/svg+xml",
            name: "bad.svg",
          },
          propertyId: id,
        },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/admin/photos", {
        headers: { origin },
        multipart: {
          file: {
            buffer: Buffer.from("<svg/>"),
            mimeType: "image/jpeg",
            name: "disguised.jpg",
          },
          propertyId: id,
        },
      })
    ).status()
  ).toBe(400);
  const image = await sharp({
    create: { background: "#7a9c93", channels: 3, height: 1800, width: 3000 },
  })
    .withMetadata()
    .jpeg()
    .toBuffer();
  await page.goto(`/admin?property=${id}#publishing`);
  await expect(
    page.getByRole("heading", { exact: true, name: "Photos & publishing" })
  ).toBeVisible();
  await page.getByLabel("Upload listing photos").setInputFiles([
    { buffer: image, mimeType: "image/jpeg", name: "one.jpg" },
    { buffer: image, mimeType: "image/jpeg", name: "two.jpg" },
  ]);
  await expect(page.getByText("Photos uploaded.", { exact: true })).toBeVisible(
    { timeout: 45_000 }
  );
  const records = async () =>
    (await page.request.get("/api/admin/management")).json();
  const photos: { id: string; url: string }[] = (await records()).photos.filter(
    (p: { propertyId: string }) => p.propertyId === id
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
          (p: { id: string }) => p.id === photos[0].id
        ).caption
    )
    .toBe("Fixture exterior");
  const gallery = page.getByRole("region", {
    exact: true,
    name: "Listing photos",
  });
  const first = gallery.getByRole("button", {
    exact: true,
    name: "Reorder photo 1",
  });
  const second = gallery.getByRole("button", {
    exact: true,
    name: "Reorder photo 2",
  });
  await page.mouse.move(0, 0);
  await expect(
    gallery.getByRole("button", { exact: true, name: "Remove photo 1" })
  ).toHaveCSS("opacity", "0");
  await expect(first).toBeEnabled();
  await first.hover();
  await expect(
    gallery.getByRole("button", { exact: true, name: "Remove photo 1" })
  ).toHaveCSS("opacity", "1");
  const from = requireValue(
      await first.boundingBox(),
      "Expected (await first.boundingBox())"
    ),
    to = requireValue(
      await second.boundingBox(),
      "Expected (await second.boundingBox())"
    );
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await records()).photos.find(
          (p: { propertyId: string; archived: boolean }) =>
            p.propertyId === id && !p.archived
        )?.id
    )
    .toBe(photos[1].id);
  await page.getByRole("button", { name: pattern1 }).click();
  await page
    .getByRole("option", { exact: true, name: "Live — confirmed by me" })
    .click();
  await expect(
    page.getByText("Publishing status saved.", { exact: true })
  ).toBeVisible();
  await page.reload();
  await expect(gallery.locator(".photo-edit-item").first()).toHaveAttribute(
    "data-photo-id",
    photos[1].id
  );
  await page.screenshot({
    fullPage: true,
    path: "test-results/photo-before-keyboard.png",
  });
  // Keyboard users can reorder and cancel without a pointer.
  await first.focus();
  await page.keyboard.press("Space");
  await expect(gallery.locator(".photo-dragging")).toHaveCount(1);
  // Let the drag library measure the grid before sending a direction key.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      gallery
        .locator(".photo-dragging")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
    )
    .toBeGreaterThan(1);
  await page.keyboard.press("Space");
  await expect
    .poll(
      async () =>
        (await records()).photos.find(
          (p: { propertyId: string; archived: boolean }) =>
            p.propertyId === id && !p.archived
        )?.id
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
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() =>
      gallery
        .locator(".photo-dragging")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
    )
    .toBeLessThan(-1);
  await page.keyboard.press("Space");
  await expect
    .poll(
      async () =>
        (await records()).photos.find(
          (p: { propertyId: string; archived: boolean }) =>
            p.propertyId === id && !p.archived
        )?.id
    )
    .toBe(photos[1].id);
  await first.focus();
  await page.keyboard.press("Space");
  await expect(gallery.locator(".photo-dragging")).toHaveCount(1);
  // Let the drag library measure the grid before sending a direction key.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      gallery
        .locator(".photo-dragging")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
    )
    .toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await expect(gallery.locator(".photo-edit-item").first()).toHaveAttribute(
    "data-photo-id",
    photos[1].id
  );
  await first.hover();
  await page.screenshot({
    fullPage: true,
    path: "test-results/photo-gallery-drag-and-drop.png",
  });
  await page.getByLabel("Caption for photo 1").fill("Updated cover caption");
  await page.getByLabel("Caption for photo 1").blur();
  await expect(
    page.getByText(
      "Listing details or photos changed. Update this site, then confirm its status again."
    )
  ).toBeVisible();
  expect((await request.get(`/api/admin/listings/${id}/export`)).status()).toBe(
    401
  );
  const exported = await page.request.get(`/api/admin/listings/${id}/export`);
  expect(exported.ok()).toBe(true);
  const files = unzipSync(await exported.body());
  expect(
    Object.keys(files).filter((p) => p.startsWith("photos/"))
  ).toHaveLength(2);
  expect(strFromU8(files["listing.txt"])).toContain(data.address);
  expect(strFromU8(files["listing.txt"])).toContain("Amenities: Yard, Patio");
  expect(strFromU8(files["READ-ME.txt"])).toContain(
    "Nothing has been submitted"
  );
  await gallery
    .getByRole("button", { exact: true, name: "Remove photo 2" })
    .focus();
  await expect(
    gallery.getByRole("button", { exact: true, name: "Remove photo 2" })
  ).toHaveCSS("opacity", "1");
  await gallery
    .getByRole("button", { exact: true, name: "Remove photo 2" })
    .click();
  await expect
    .poll(
      async () =>
        (await records()).photos.find(
          (p: { id: string }) => p.id === photos[0].id
        ).archived
    )
    .toBe(true);
  await page.getByText("Removed photos (1)", { exact: true }).click();
  await page
    .getByRole("button", { exact: true, name: "Restore photo" })
    .click();
  await expect
    .poll(
      async () =>
        (await records()).photos.find(
          (p: { id: string }) => p.id === photos[0].id
        ).archived
    )
    .toBe(false);
  await page.emulateMedia({ media: "screen" });
  const mobile = await requireValue(
    page.context().browser(),
    "Expected page     .context()     .browser()"
  ).newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  });
  await mobile.addCookies(await page.context().cookies());
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`/admin?property=${id}#publishing`);
  await expect(
    mobilePage.getByRole("button", { exact: true, name: "Remove photo 1" })
  ).toHaveCSS("opacity", "1");
  expect(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await mobile.close();
  expect((await save(2, true)).ok()).toBe(true);
  expect((await request.get(photos[0].url)).ok()).toBe(true);
  const property = (await records()).properties.find(
    (p: { id: string }) => p.id === id
  );
  await page.goto(`/properties/${property.slug}`);
  await expect(page.locator("#property-overview")).toHaveCSS(
    "border-bottom-width",
    "0px"
  );
  await expect(page.locator("#property-about")).toHaveCSS(
    "border-top-width",
    "0px"
  );
  await expect(page.locator("#property-amenities li")).toHaveCount(2);
  await expect(page.locator("#property-amenities li svg")).toHaveCount(2);
  await expect(page.locator("#property-amenities")).toContainText("Yard");
  await expect(page.locator("#property-amenities")).toContainText("Patio");

  await expect(
    page.getByRole("region", { name: "Property photos" })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View photo 2: Fixture exterior" })
    .click();
  await expect(
    page.getByRole("img", { exact: true, name: "Fixture exterior" })
  ).toBeVisible();
  const viewer = page.getByRole("dialog", { name: `${data.name} · Photos` });
  await expect(viewer).toBeVisible();
  const closePhotos = viewer.getByRole("button", {
    exact: true,
    name: "Close photos",
  });
  await expect(closePhotos.locator("svg")).toHaveCount(1);
  await expect(closePhotos).toHaveText("");
  await expect(closePhotos).toHaveCSS("border-top-width", "0px");

  await expect(viewer.getByText("Photo 2 of 2", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("Photo 1 of 2", { exact: true })).toBeVisible();
  await viewer
    .getByRole("button", { exact: true, name: "Previous photo" })
    .click();
  await expect(viewer.getByText("Photo 2 of 2", { exact: true })).toBeVisible();
  await page.setViewportSize({ height: 844, width: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(viewer).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "View photo 2: Fixture exterior" })
  ).toBeFocused();
  await expect(
    page.getByText(
      "Full description ends here; this paragraph must remain visible.",
      { exact: true }
    )
  ).toBeVisible();
  for (const mode of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: mode });
    const apply = page.getByRole("link", {
      exact: true,
      name: "Apply for this property",
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
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Owner workspace" })
  ).toBeVisible();
  const visitor = await request.get("/properties");
  expect(await visitor.text()).not.toContain('href="/admin"');
  const signedOutAdmin = await request.get("/admin");
  expect(await signedOutAdmin.text()).not.toContain(">Workspace</a>");
  expect(
    (
      await page.request.patch("/api/admin/photos", {
        data: { action: "archive", archived: true, id: photos[0].id },
        headers: { origin },
      })
    ).ok()
  ).toBe(true);
  expect((await request.get(photos[0].url)).status()).toBe(404);
  expect(
    (
      await page.request.patch("/api/admin/photos", {
        data: { action: "archive", archived: false, id: photos[0].id },
        headers: { origin },
      })
    ).ok()
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
    .getByRole("button", { exact: true, name: "Sign out" })
    .click();
  await expect(
    page.getByLabel("Applicant full name", { exact: true })
  ).toHaveValue("Unsaved fixture");
  expect((await page.request.get("/api/admin/management")).ok()).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { exact: true, name: "New notice" }).click();
  await expect(
    page.getByLabel("Applicant full name", { exact: true })
  ).toHaveValue("");
  await expect(
    page
      .getByRole("navigation", { name: "Account navigation" })
      .getByRole("button", { exact: true, name: "Sign out" })
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "Account navigation" })
      .getByRole("link", { exact: true, name: "Workspace" })
  ).toHaveAttribute("href", "/admin");
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { exact: true, name: "Properties" })
    .click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Properties" })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.screenshot({
    fullPage: true,
    path: "test-results/owner-workspace-updated.png",
  });
  expect(errors).toEqual([]);
});
