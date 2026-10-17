import { test, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { noticeVersions, noticeDeliveries } from "../../lib/db/schema";
import { blankNotice, renderNotice } from "../../lib/adverse/notice";
loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  database = drizzle(process.env.DATABASE_URL!),
  ids: string[] = [];
test.afterAll(async () => {
  for (const id of ids) {
    await database
      .delete(noticeDeliveries)
      .where(eq(noticeDeliveries.versionId, id));
    await database.delete(noticeVersions).where(eq(noticeVersions.id, id));
  }
});
test("notice list groups versions, searches, paginates and opens isolated history", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  expect((await request.get("/api/admin/notices?view=list")).status()).toBe(
    401,
  );
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      sub: "list-test-owner",
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
  const email = `list-${crypto.randomUUID().slice(0, 8)}@example.invalid`,
    name = "List view TEST applicant",
    propertyA = "TEST Property A",
    propertyB = "TEST Property B";
  const save = async (property: string, parentId: string | null) => {
    const id = crypto.randomUUID();
    ids.push(id);
    const response = await page.request.post("/api/admin/notices", {
      headers: { origin },
      data: {
        notice: {
          ...blankNotice(),
          applicantName: name,
          applicantEmail: email,
          property,
        },
        parentId,
        requestId: id,
      },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).version;
  };
  const first = await save(propertyA, null),
    second = await save(propertyA, first.id),
    other = await save(propertyB, null);
  await database.insert(noticeDeliveries).values({
    versionId: first.id,
    status: "accepted",
    resendId: "test-only-not-sent",
  });
  const data = await (
    await page.request.get(
      `/api/admin/notices?view=list&q=${encodeURIComponent(email)}`,
    )
  ).json();
  expect(data.documents).toHaveLength(2);
  expect(
    data.documents.find(
      (r: { documentId: string }) => r.documentId === first.documentId,
    ).version,
  ).toBe(2);
  expect(
    data.documents.find(
      (r: { documentId: string }) => r.documentId === first.documentId,
    ).lastAcceptedVersion,
  ).toBe(1);
  const scoped = await (
    await page.request.get(`/api/admin/notices?documentId=${first.documentId}`)
  ).json();
  expect(scoped.versions).toHaveLength(2);
  expect(
    scoped.versions.every(
      (v: { documentId: string }) => v.documentId === first.documentId,
    ),
  ).toBe(true);
  expect(
    (await page.request.get("/api/admin/notices?documentId=invalid")).status(),
  ).toBe(400);
  await page.goto("/admin/adverse-actions");
  await expect(
    page.getByRole("heading", { name: "All notices", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search notices", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const table = page.getByRole("table", {
    name: "Adverse-action notices",
    exact: true,
  });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  const row = table.getByRole("row").filter({ hasText: propertyA });
  await expect(row).toContainText("Version 2");
  await expect(row).toContainText("Version 1 previously accepted by Resend");
  await page.getByRole("button", { name: /Latest version status/ }).click();
  await page
    .getByRole("option", { name: "Accepted by Resend", exact: true })
    .click();
  await expect(page.getByText("No notices match these filters.")).toBeVisible();
  await page.getByRole("button", { name: /Latest version status/ }).click();
  await page.getByRole("option", { name: "Draft", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/adverse-notice-list.png",
    fullPage: true,
  });
  await row.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(first.documentId));
  await expect(
    page.getByLabel("Applicant full name", { exact: true }),
  ).toHaveValue(name);
  await expect(
    page.getByLabel("Property address", { exact: true }),
  ).toHaveValue(propertyA);
  await expect(page.locator(".notice-history .version-item")).toHaveCount(2);
  await expect(page.locator(".notice-history")).not.toContainText(propertyB);
  await page
    .getByRole("link", { name: "← All adverse-action notices", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "All notices", exact: true }),
  ).toBeVisible();
  const extra = Array.from({ length: 26 }, (_, i) => {
    const id = crypto.randomUUID(),
      notice = {
        ...blankNotice(),
        applicantName: `List pagination TEST ${i + 1}`,
        applicantEmail: email,
        property: "TEST pagination property",
      },
      rendered = renderNotice(notice);
    ids.push(id);
    return {
      id,
      documentId: crypto.randomUUID(),
      version: 1,
      notice,
      html: rendered.html,
      plainText: rendered.text,
      subject: rendered.subject,
    };
  });
  await database.insert(noticeVersions).values(extra);
  const one = await (
      await page.request.get(
        `/api/admin/notices?view=list&q=${encodeURIComponent(email)}`,
      )
    ).json(),
    two = await (
      await page.request.get(
        `/api/admin/notices?view=list&q=${encodeURIComponent(email)}&offset=${one.nextOffset}`,
      )
    ).json();
  expect(one.documents).toHaveLength(25);
  expect(one.hasMore).toBe(true);
  expect(two.documents).toHaveLength(3);
  expect(
    new Set([...one.documents, ...two.documents].map((r) => r.documentId)).size,
  ).toBe(28);
  await page.goto(`/admin/adverse-actions?q=${encodeURIComponent(email)}`);
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await page
    .getByRole("button", { name: "Load more notices", exact: true })
    .click();
  await expect(table.locator("tbody tr")).toHaveCount(28);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/adverse-notice-list-mobile.png",
    fullPage: true,
  });
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    elements: Array.from(
      document.querySelectorAll(
        '.owner-app,.owner-layout,.owner-main,.notice-list-filters,.notice-table-scroll,.owner-sidebar,section[aria-label="Adverse-action notice list"]',
      ),
    ).map((el) => ({
      class: el.className,
      width: el.getBoundingClientRect().width,
      right: el.getBoundingClientRect().right,
      scroll: el.scrollWidth,
    })),
  }));
  expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport,
  );
});
