import "./harness";
import type { PGlite } from "@electric-sql/pglite";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/admin/branding/route";
import { defaultBrandColors } from "@/lib/brand-colors";
import { brandVersions } from "@/lib/db/schema";
import { pg, reset, start, state } from "./harness";

beforeAll(start);
beforeEach(async () => {
  await reset();
  await state.database.delete(brandVersions);
});
afterAll(async () => {
  await (pg as PGlite).close();
});

const custom = {
  dark: { ...defaultBrandColors.dark, primary: "oklch(80% 0.1 150)" },
  light: { ...defaultBrandColors.light, primary: "oklch(30% 0.05 180)" },
};
async function post(fields: Record<string, string>) {
  // PGlite timestamps are millisecond-precise; keep each version strictly newer.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return await POST(
    new NextRequest("https://rental.example.invalid/api/admin/branding", {
      body: form,
      headers: { origin: "https://rental.example.invalid" },
      method: "POST",
    })
  );
}
const latest = async () =>
  (
    await state.database
      .select()
      .from(brandVersions)
      .orderBy(desc(brandVersions.createdAt))
  )[0];

describe("brand color versions", () => {
  it("saves validated light and dark palettes with the brand version", async () => {
    const response = await post({
      colors: JSON.stringify(custom),
      name: "Saved Brand",
    });
    expect(response.status).toBe(200);
    expect((await latest()).colors).toEqual(custom);
    const current = await (
      await GET(
        new NextRequest("https://rental.example.invalid/api/admin/branding")
      )
    ).json();
    expect(current.current.colors).toEqual(custom);
    expect(current.history[0].hasColors).toBe(true);
  });
  it.each([
    ["not JSON", "{"],
    [
      "an unsafe value",
      JSON.stringify({
        ...custom,
        light: { ...custom.light, ink: "red;}body{display:none" },
      }),
    ],
    [
      "a missing token",
      JSON.stringify({
        dark: custom.dark,
        light: { primary: "oklch(30% 0.05 180)" },
      }),
    ],
  ])("rejects %s without saving a version", async (_label, colors) => {
    expect((await post({ colors, name: "Saved Brand" })).status).toBe(400);
    expect(await state.database.select().from(brandVersions)).toEqual([]);
  });
  it("keeps saved colors when only the name or logo changes", async () => {
    await post({ colors: JSON.stringify(custom), name: "Saved Brand" });
    await post({ name: "Renamed Brand", remove: "true" });
    const row = await latest();
    expect(row.name).toBe("Renamed Brand");
    expect(row.colors).toEqual(custom);
  });
  it("restores the colors of an earlier version", async () => {
    await post({ colors: JSON.stringify(custom), name: "Saved Brand" });
    const first = await latest();
    await post({
      colors: JSON.stringify(defaultBrandColors),
      name: "Saved Brand",
    });
    expect((await latest()).colors).toEqual(defaultBrandColors);
    await post({ name: "Saved Brand", restore: first.id });
    expect((await latest()).colors).toEqual(custom);
  });
});
