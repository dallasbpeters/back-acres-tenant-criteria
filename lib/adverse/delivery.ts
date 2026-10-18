/** Claim each immutable version before contacting the email provider. */
export async function deliverVersion(deps: {
  claim: () => Promise<boolean>;
  send: () => Promise<{ ok: boolean; status: number; id?: string }>;
  record: (
    status: "accepted" | "rejected" | "unknown",
    id?: string
  ) => Promise<void>;
}) {
  if (!(await deps.claim())) {
    return {
      body: {
        error:
          "This version already has a send attempt. Check its status and Resend before creating another version.",
      },
      status: 409,
    };
  }
  try {
    const result = await deps.send();
    if (!result.ok) {
      await deps.record(result.status >= 500 ? "unknown" : "rejected");
      return {
        body: {
          error:
            "Resend did not confirm acceptance. Check the send status before trying another version.",
        },
        status: 502,
      };
    }
    if (!result.id) {
      throw new Error("Missing provider receipt");
    }
    await deps.record("accepted", result.id);
    return { body: { ok: true, resendId: result.id }, status: 200 };
  } catch {
    await deps.record("unknown");
    return {
      body: {
        error:
          "Delivery status is uncertain. Check Resend before sending again; this version is locked to prevent duplicates.",
      },
      status: 502,
    };
  }
}
