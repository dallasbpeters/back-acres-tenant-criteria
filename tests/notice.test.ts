import { requireValue } from "@/lib/required";

const pattern1 = /actual required terms/;

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blankNotice,
  noticeSchema,
  renderNotice,
  sendErrors,
} from "../lib/adverse/notice";

const complete = () => ({
  ...blankNotice(),
  agencies: [
    { address: "123 Test St", name: "Test Agency", phone: "800-555-0100" },
  ],
  applicantEmail: "applicant@example.com",
  applicantName: "Test Applicant",
  reasons: {
    content: [
      {
        content: [{ text: "Documented reason.", type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  },
  senderContact: "owner@example.com",
});
test("incomplete notices can be saved but cannot be sent", () => {
  assert.equal(noticeSchema.safeParse(blankNotice()).success, true);
  assert.ok(sendErrors(blankNotice()).length >= 4);
  assert.deepEqual(sendErrors(complete()), []);
});
test("consumer report notice carries rights and all agencies", () => {
  const n = complete();
  n.agencies.push({
    address: "456 Test St",
    name: "Second Agency",
    phone: "800-555-0101",
  });
  const result = renderNotice(n);
  for (const text of [
    "Test Agency",
    "Second Agency",
    "60 days",
    "right to dispute",
    "did not make this decision",
  ]) {
    assert.ok(result.text.includes(text));
  }
});
test("credit score requires source, range, date and ordered factors", () => {
  const n = { ...complete(), scoreUsed: true };
  assert.ok(sendErrors(n).length);
  Object.assign(n, {
    score: "650",
    scoreDate: "2026-10-17",
    scoreFactors: "1. First factor\n2. Second factor",
    scoreMax: "850",
    scoreMin: "300",
    scoreSource: "Test scoring source",
  });
  assert.deepEqual(sendErrors(n), []);
  assert.ok(renderNotice(n).text.includes("range 300–850"));
  assert.ok(sendErrors({ ...n, score: "900" }).length);
  assert.ok(sendErrors({ ...n, reportUsed: false }).length);
});
test("all user text is escaped and rich content has an allowlist", () => {
  const n = complete();
  n.applicantName = "<script>alert(1)</script>";
  const [paragraph] = requireValue(
    n.reasons.content,
    "Expected notice paragraph"
  );
  const [run] = requireValue(paragraph.content, "Expected paragraph content");
  run.text = "<img src=x onerror=alert(1)>";

  const { html } = renderNotice(n);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.equal(
    noticeSchema.safeParse({ ...n, reasons: { type: "iframe" } }).success,
    false
  );
  assert.equal(
    noticeSchema.safeParse({
      ...n,
      reasons: {
        marks: [{ attrs: { href: "javascript:alert(1)" }, type: "link" }],
        text: "link",
        type: "text",
      },
    }).success,
    false
  );
});
test("non-report notices omit unrelated FCRA boilerplate and require alternative terms", () => {
  const n = {
    ...complete(),
    action: "Higher rent required" as const,
    reportUsed: false,
  };
  assert.ok(sendErrors(n).length);
  n.actionDetails = "Monthly rent would be $2,600.";
  assert.deepEqual(sendErrors(n), []);
  assert.ok(!renderNotice(n).text.includes("60 days"));
});

test("sourced notice drafts preserve identity and disclosures, require conditional terms, and do not claim attorney approval", async () => {
  const { applyNoticeTemplate, noticeTemplates, noticeTemplateRevision } =
    await import("../lib/adverse/templates");
  const original = {
    ...complete(),
    score: "650",
    scoreDate: "2026-10-17",
    scoreFactors: "Test factor",
    scoreMax: "850",
    scoreMin: "300",
    scoreSource: "Test source",
    scoreUsed: true,
  };
  for (const template of noticeTemplates) {
    const next = applyNoticeTemplate(
      original,
      template.id,
      template.action === "Application denied"
        ? ""
        : "Actual conditions provided by owner",
      "Verified applicant-specific fact."
    );
    assert.equal(next.applicantName, original.applicantName);
    assert.equal(next.applicantEmail, original.applicantEmail);
    assert.equal(next.property, original.property);
    assert.deepEqual(next.agencies, original.agencies);
    assert.equal(next.reportUsed, true);
    assert.equal(next.scoreUsed, true);
    assert.equal(next.score, "650");
    assert.equal(next.template?.revision, noticeTemplateRevision);
    assert.ok(renderNotice(next).text.includes("60 days"));
    assert.ok(
      renderNotice(next).text.includes("Verified applicant-specific fact.")
    );
    assert.deepEqual(sendErrors(next), []);
  }
  assert.throws(
    () => applyNoticeTemplate(original, "report-deposit"),
    pattern1
  );
  assert.equal(
    noticeSchema.safeParse({
      ...original,
      template: {
        id: "made-up-attorney-approved",
        revision: noticeTemplateRevision,
      },
    }).success,
    false
  );
  const parsed = noticeSchema.parse({
    ...applyNoticeTemplate(original, "report-denial"),
    template: {
      attorneyApproved: true,
      id: "report-denial",
      revision: noticeTemplateRevision,
    },
  });
  assert.equal(
    "attorneyApproved" in
      requireValue(parsed.template, "Expected parsed.template"),
    false
  );
  assert.equal(noticeSchema.parse(complete()).template, undefined);
});
