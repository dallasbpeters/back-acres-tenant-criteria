import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { POLICY } from "@/lib/policy";
import { canAcceptAcknowledgments } from "@/lib/ready";
import {
  criteriaHash,
  type Receipt,
  receiptHtml,
  receiptText,
} from "@/lib/receipt";
import { requireValue } from "@/lib/required";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const respond = (body: unknown, status: number) =>
  NextResponse.json(body, { headers: { "Cache-Control": "no-store" }, status });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export async function POST(request: NextRequest) {
  if (!canAcceptAcknowledgments()) {
    return respond(
      { error: "Acknowledgments are not being accepted yet." },
      503
    );
  }

  // Accept JSON only, reject oversized requests and cross-origin browser submissions.
  if (
    !(request.headers.get("content-type") || "").includes("application/json")
  ) {
    return respond({ error: "Unsupported request." }, 415);
  }
  if (Number(request.headers.get("content-length") || 0) > 8192) {
    return respond({ error: "Request too large." }, 413);
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) {
        return respond({ error: "Invalid origin." }, 403);
      }
    } catch {
      return respond({ error: "Invalid origin." }, 403);
    }
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
    if (!input || Array.isArray(input) || typeof input !== "object") {
      throw new Error("Invalid acknowledgment input.");
    }
  } catch {
    return respond({ error: "Invalid form submission." }, 400);
  }

  const fullName =
    typeof input.fullName === "string"
      ? input.fullName.trim().replace(/\s+/g, " ")
      : "";
  const applicantEmail =
    typeof input.applicantEmail === "string"
      ? input.applicantEmail.trim().toLowerCase()
      : "";
  const accessCode =
    typeof input.accessCode === "string" ? input.accessCode.trim() : "";
  const honeypot =
    typeof input.website === "string" ? input.website.trim() : "";

  if (honeypot) {
    return respond({ ok: true }, 200); // Avoid signaling bot detection.
  }
  if (
    fullName.length < 3 ||
    fullName.length > 120 ||
    !EMAIL.test(applicantEmail) ||
    applicantEmail.length > 254
  ) {
    return respond(
      { error: "Enter your full name and a valid email address." },
      400
    );
  }
  if (
    input.read !== true ||
    input.electronicConsent !== true ||
    input.policyVersion !== POLICY.version
  ) {
    return respond(
      { error: "You must review and acknowledge the current criteria." },
      400
    );
  }
  if (process.env.ACCESS_CODE && accessCode !== process.env.ACCESS_CODE) {
    return respond({ error: "The access code is not correct." }, 403);
  }

  const receipt: Receipt = {
    applicantEmail,
    criteriaSHA256: criteriaHash(),
    fullName,
    ipAddress:
      request.headers
        .get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim()
        ?.slice(0, 70) || "Not available",
    policyVersion: POLICY.version,
    recordId: randomUUID(),
    timestamp: new Date().toISOString(),
    userAgent: (request.headers.get("user-agent") || "Not available").slice(
      0,
      400
    ),
  };

  // One email copied privately to each required recipient; owners' emails are not exposed in To.
  // The email contains all criteria and the signed receipt, so each recipient retains a copy.
  const ownerRecipients = Array.from(
    new Set(
      [
        requireValue(
          process.env.LANDLORD_EMAIL,
          "Expected process.env.LANDLORD_EMAIL"
        ),
        requireValue(
          process.env.TANDRA_EMAIL,
          "Expected process.env.TANDRA_EMAIL"
        ),
      ].map((address) => address.trim().toLowerCase())
    )
  );
  const bcc = ownerRecipients.filter((address) => address !== applicantEmail);
  const outbound = {
    bcc,
    from: process.env.FROM_EMAIL,
    html: receiptHtml(receipt),
    subject: `Tenant criteria acknowledgment received — ${POLICY.street}`,
    text: receiptText(receipt),
    to: [applicantEmail],
  };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify(outbound),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `criteria/${receipt.recordId}`,
      },
      method: "POST",
    });
    if (!response.ok) {
      console.error(
        "Resend rejected acknowledgment email",
        response.status,
        (await response.text()).slice(0, 500)
      );
      return respond(
        {
          error:
            "Your confirmation could not be sent. Please try again or contact Back Acres Rentals.",
        },
        502
      );
    }
    return respond(
      {
        ok: true,
        recordId: receipt.recordId,
        timestamp: receipt.timestamp,
        version: POLICY.version,
      },
      200
    );
  } catch (err) {
    console.error("Could not send acknowledgment email", err);
    return respond(
      {
        error:
          "The email service is temporarily unavailable. Please try again.",
      },
      503
    );
  }
}
