// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.
import { requireValue } from "@/lib/required";

const pattern1 = /Latest version status/;
const pattern2 = /Latest version status/;

import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { encode } from "next-auth/jwt";
import { blankNotice, renderNotice } from "../../lib/adverse/notice";
import { noticeDeliveries, noticeVersions } from "../../lib/db/schema";

loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  database = drizzle(
    requireValue(process.env.DATABASE_URL, "Expected process.env.DATABASE_URL")
  ),
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
  test.setTimeout(60_000);
  expect((await request.get("/api/admin/notices?view=list")).status()).toBe(
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
      sub: "list-test-owner",
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
  const email = `list-${crypto.randomUUID().slice(0, 8)}@example.invalid`,
    name = "List view TEST applicant",
    propertyA = "TEST Property A",
    propertyB = "TEST Property B";
  const save = async (property: string, parentId: string | null) => {
    const id = crypto.randomUUID();
    ids.push(id);
    const response = await page.request.post("/api/admin/notices", {
      data: {
        notice: {
          ...blankNotice(),
          applicantEmail: email,
          applicantName: name,
          property,
        },
        parentId,
        requestId: id,
      },
      headers: { origin },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).version;
  };
  const first = await save(propertyA, null),
    _second = await save(propertyA, first.id),
    _other = await save(propertyB, null);
  await database.insert(noticeDeliveries).values({
    resendId: "test-only-not-sent",
    status: "accepted",
    versionId: first.id,
  });
  const data = await (
    await page.request.get(
      `/api/admin/notices?view=list&q=${encodeURIComponent(email)}`
    )
  ).json();
  expect(data.documents).toHaveLength(2);
  expect(
    data.documents.find(
      (r: { documentId: string }) => r.documentId === first.documentId
    ).version
  ).toBe(2);
  expect(
    data.documents.find(
      (r: { documentId: string }) => r.documentId === first.documentId
    ).lastAcceptedVersion
  ).toBe(1);
  const scoped = await (
    await page.request.get(`/api/admin/notices?documentId=${first.documentId}`)
  ).json();
  expect(scoped.versions).toHaveLength(2);
  expect(
    scoped.versions.every(
      (v: { documentId: string }) => v.documentId === first.documentId
    )
  ).toBe(true);
  expect(
    (await page.request.get("/api/admin/notices?documentId=invalid")).status()
  ).toBe(400);
  await page.goto("/admin/adverse-actions");
  await expect(
    page.getByRole("heading", { exact: true, name: "All notices" })
  ).toBeVisible();
  await page.getByLabel("Search notices", { exact: true }).fill(email);
  await page.getByRole("button", { exact: true, name: "Search" }).click();
  const table = page.getByRole("table", {
    exact: true,
    name: "Adverse-action notices",
  });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  const row = table.getByRole("row").filter({ hasText: propertyA });
  await expect(row).toContainText("Version 2");
  await expect(row).toContainText("Version 1 previously accepted by Resend");
  await page.getByRole("button", { name: pattern1 }).click();
  await page
    .getByRole("option", { exact: true, name: "Accepted by Resend" })
    .click();
  await expect(page.getByText("No notices match these filters.")).toBeVisible();
  await page.getByRole("button", { name: pattern2 }).click();
  await page.getByRole("option", { exact: true, name: "Draft" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.screenshot({
    fullPage: true,
    path: "test-results/adverse-notice-list.png",
  });
  await row.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(first.documentId));
  await expect(
    page.getByLabel("Applicant full name", { exact: true })
  ).toHaveValue(name);
  await expect(
    page.getByLabel("Property address", { exact: true })
  ).toHaveValue(propertyA);
  await expect(page.locator(".notice-history .version-item")).toHaveCount(2);
  await expect(page.locator(".notice-history")).not.toContainText(propertyB);
  await page
    .getByRole("link", { exact: true, name: "← All adverse-action notices" })
    .click();
  await expect(
    page.getByRole("heading", { exact: true, name: "All notices" })
  ).toBeVisible();
  const extra = Array.from({ length: 26 }, (_, i) => {
    const id = crypto.randomUUID(),
      notice = {
        ...blankNotice(),
        applicantEmail: email,
        applicantName: `List pagination TEST ${i + 1}`,
        property: "TEST pagination property",
      },
      rendered = renderNotice(notice);
    ids.push(id);
    return {
      documentId: crypto.randomUUID(),
      html: rendered.html,
      id,
      notice,
      plainText: rendered.text,
      subject: rendered.subject,
      version: 1,
    };
  });
  await database.insert(noticeVersions).values(extra);
  const one = await (
      await page.request.get(
        `/api/admin/notices?view=list&q=${encodeURIComponent(email)}`
      )
    ).json(),
    two = await (
      await page.request.get(
        `/api/admin/notices?view=list&q=${encodeURIComponent(email)}&offset=${one.nextOffset}`
      )
    ).json();
  expect(one.documents).toHaveLength(25);
  expect(one.hasMore).toBe(true);
  expect(two.documents).toHaveLength(3);
  expect(
    new Set([...one.documents, ...two.documents].map((r) => r.documentId)).size
  ).toBe(28);
  await page.goto(`/admin/adverse-actions?q=${encodeURIComponent(email)}`);
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await page
    .getByRole("button", { exact: true, name: "Load more notices" })
    .click();
  await expect(table.locator("tbody tr")).toHaveCount(28);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.screenshot({
    fullPage: true,
    path: "test-results/adverse-notice-list-mobile.png",
  });
  const dimensions = await page.evaluate(() => ({
    elements: Array.from(
      document.querySelectorAll(
        '.owner-app,.owner-layout,.owner-main,.notice-list-filters,.notice-table-scroll,.owner-sidebar,section[aria-label="Adverse-action notice list"]'
      )
    ).map((el) => ({
      class: el.className,
      right: el.getBoundingClientRect().right,
      scroll: el.scrollWidth,
      width: el.getBoundingClientRect().width,
    })),
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport
  );
});
