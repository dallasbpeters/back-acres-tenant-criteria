import { createHash, randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { reply, sameOrigin } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { insuranceDocuments } from "@/lib/db/schema";
import { allowIntake } from "@/lib/management/security";
import { assignment, tenantIdentity } from "@/lib/tenant/access";
import {
  insuranceDetailsSchema,
  insuranceFileKind,
  insuranceMaxBytes,
  safeFileName,
} from "@/lib/tenant/insurance";

export const runtime = "nodejs";
const fileError = "Choose a PDF, JPG, or PNG file under 10 MB.";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return reply({ error: "Invalid origin." }, 403);
  }
  if (
    Number(request.headers.get("content-length") || 0) >
    insuranceMaxBytes + 100_000
  ) {
    return reply({ error: fileError }, 413);
  }
  try {
    const userId = await tenantIdentity();
    if (!userId) {
      return reply({ error: "Please sign in." }, 401);
    }
    const form = await request.formData();
    const accessId = z.string().uuid().safeParse(form.get("id"));
    if (!accessId.success) {
      return reply({ error: "This tenancy is not available." }, 404);
    }
    // The tenancy comes from the signed-in account, never from the form alone.
    const access = await assignment(userId, accessId.data);
    if (!access) {
      return reply({ error: "This tenancy is not available." }, 404);
    }
    const details = insuranceDetailsSchema.safeParse({
      carrier: form.get("carrier"),
      endsOn: form.get("endsOn"),
      policyNumber: form.get("policyNumber"),
      startsOn: form.get("startsOn"),
    });
    if (!details.success) {
      return reply(
        {
          error:
            "Enter the insurance company, policy number, and policy dates.",
        },
        400
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return reply({ error: fileError }, 400);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = insuranceFileKind(bytes);
    if (!kind) {
      return reply({ error: fileError }, 400);
    }
    if (!(await allowIntake(request, `tenant-insurance:${access.id}`))) {
      return reply(
        {
          error:
            "Too many uploads. Please contact Back Acres Rentals directly.",
        },
        429
      );
    }
    const id = randomUUID(),
      blobPath = `insurance/${access.propertyId}/${id}.${kind.extension}`;
    await put(blobPath, bytes, {
      access: "private",
      addRandomSuffix: false,
      contentType: kind.contentType,
    });
    await db()
      .insert(insuranceDocuments)
      .values({
        ...details.data,
        blobPath,
        contentType: kind.contentType,
        fileName: safeFileName(file.name, kind.extension),
        fileSha256: createHash("sha256").update(bytes).digest("hex"),
        id,
        propertyId: access.propertyId,
        size: bytes.length,
        tenantAccessId: access.id,
      });
    return reply({ id }, 201);
  } catch {
    return reply(
      { error: "Upload failed. Please retry or contact Back Acres Rentals." },
      503
    );
  }
}
