import { randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { after, type NextRequest } from "next/server";
import { reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { paymentRecoveryRuns } from "@/lib/db/schema";
import {
  deliverAuthorizationReceipts,
  reconcileRecentPayments,
} from "@/lib/management/payment-recovery";
import { flushPosthogLogs, logPaymentRecovery } from "@/lib/posthog-logs";

export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return reply({ error: "Unauthorized." }, 401);
  }
  const runId = randomUUID();
  try {
    await db()
      .insert(paymentRecoveryRuns)
      .values({ id: runId, status: "running" });
    // A Stripe outage must not prevent already-accepted terms being emailed.
    const [payments, receipts] = await Promise.allSettled([
      reconcileRecentPayments(),
      deliverAuthorizationReceipts(),
    ]);
    if (payments.status === "rejected" || receipts.status === "rejected") {
      throw new Error("A recovery service failed.");
    }
    await db()
      .update(paymentRecoveryRuns)
      .set({
        acceptedReceipts: receipts.value,
        completedAt: new Date(),
        reconciled: payments.value,
        status: "complete",
      })
      .where(eq(paymentRecoveryRuns.id, runId));
    if (logPaymentRecovery("completed")) {
      after(flushPosthogLogs);
    }
    return reply({
      acceptedReceipts: receipts.value,
      reconciled: payments.value,
    });
  } catch {
    try {
      await db()
        .update(paymentRecoveryRuns)
        .set({ completedAt: new Date(), status: "failed" })
        .where(eq(paymentRecoveryRuns.id, runId));
    } catch {
      // A database outage can leave the run marked running; the owner view flags it.
    }
    console.error("payment_recovery_failed");
    if (logPaymentRecovery("failed")) {
      after(flushPosthogLogs);
    }
    return reply({ error: "Payment recovery needs owner review." }, 503);
  }
}
