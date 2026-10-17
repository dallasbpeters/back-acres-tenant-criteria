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
    description: "Temporary test fixture — not a rental offer.",
    rentCents: 100000,
    bedrooms: 2,
    bathrooms: 1,
    availableDate: "",
    contact: "fixture@example.invalid",
    published: false,
    acceptingApplications: false,
  };
  const save = (revision: number, published: boolean) =>
    page.request.post("/api/admin/management", {
      headers: { origin },
      data: { action: "property", id, revision, data: { ...data, published } },
    });
  expect((await save(0, false)).ok()).toBe(true);
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
  await page.getByRole("button", { name: "Make cover", exact: true }).click();
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
    .getByLabel("Zillow Rental Manager publishing status")
    .selectOption("live");
  await expect(
    page.getByText("Publishing status saved.", { exact: true }),
  ).toBeVisible();
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
  expect(strFromU8(files["READ-ME.txt"])).toContain(
    "Nothing has been submitted",
  );
  expect((await save(1, true)).ok()).toBe(true);
  expect((await request.get(photos[0].url)).ok()).toBe(true);
  const property = (await records()).properties.find(
    (p: { id: string }) => p.id === id,
  );
  await page.goto(`/properties/${property.slug}`);
  await expect(
    page.getByRole("region", { name: "Property photos" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View photo 2: Fixture exterior" })
    .click();
  await expect(
    page.getByRole("img", { name: "Fixture exterior", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
  expect((await save(2, false)).ok()).toBe(true);
  expect((await request.get(photos[0].url)).status()).toBe(404);
  await cleanup();
  await page.goto("/admin/adverse-actions");
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
