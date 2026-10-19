import "server-only";
import { get } from "@vercel/blob";
import type { insuranceDocuments } from "@/lib/db/schema";

/** Streams a private insurance file as a download; never rendered inline. */
export async function insuranceFileResponse(
  document: typeof insuranceDocuments.$inferSelect
) {
  const result = await get(document.blobPath, { access: "private" });
  if (!result?.stream) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(result.stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${document.fileName}"`,
      "Content-Type": document.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
