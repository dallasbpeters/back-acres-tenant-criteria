import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankNotice,
  noticeSchema,
  renderNotice,
  sendErrors,
} from "../lib/adverse/notice";
const complete = () => ({
  ...blankNotice(),
  applicantName: "Test Applicant",
  applicantEmail: "applicant@example.com",
  senderContact: "owner@example.com",
  reasons: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Documented reason." }],
      },
    ],
  },
  agencies: [
    { name: "Test Agency", address: "123 Test St", phone: "800-555-0100" },
  ],
});
test("incomplete notices can be saved but cannot be sent", () => {
  assert.equal(noticeSchema.safeParse(blankNotice()).success, true);
  assert.ok(sendErrors(blankNotice()).length >= 4);
  assert.deepEqual(sendErrors(complete()), []);
});
test("consumer report notice carries rights and all agencies", () => {
  const n = complete();
  n.agencies.push({
    name: "Second Agency",
    address: "456 Test St",
    phone: "800-555-0101",
  });
  const result = renderNotice(n);
  for (const text of [
    "Test Agency",
    "Second Agency",
    "60 days",
    "right to dispute",
    "did not make this decision",
  ])
    assert.ok(result.text.includes(text));
});
test("credit score requires source, range, date and ordered factors", () => {
  const n = { ...complete(), scoreUsed: true };
  assert.ok(sendErrors(n).length);
  Object.assign(n, {
    score: "650",
    scoreMin: "300",
    scoreMax: "850",
    scoreDate: "2026-10-17",
    scoreSource: "Test scoring source",
    scoreFactors: "1. First factor\n2. Second factor",
  });
  assert.deepEqual(sendErrors(n), []);
  assert.ok(renderNotice(n).text.includes("range 300–850"));
  assert.ok(sendErrors({ ...n, score: "900" }).length);
  assert.ok(sendErrors({ ...n, reportUsed: false }).length);
});
test("all user text is escaped and rich content has an allowlist", () => {
  const n = complete();
  n.applicantName = "<script>alert(1)</script>";
  n.reasons.content![0].content![0].text = "<img src=x onerror=alert(1)>";
  const html = renderNotice(n).html;
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.equal(
    noticeSchema.safeParse({ ...n, reasons: { type: "iframe" } }).success,
    false,
  );
  assert.equal(
    noticeSchema.safeParse({
      ...n,
      reasons: {
        type: "text",
        text: "link",
        marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
      },
    }).success,
    false,
  );
});
test("non-report notices omit unrelated FCRA boilerplate and require alternative terms", () => {
  const n = {
    ...complete(),
    reportUsed: false,
    action: "Higher rent required" as const,
  };
  assert.ok(sendErrors(n).length);
  n.actionDetails = "Monthly rent would be $2,600.";
  assert.deepEqual(sendErrors(n), []);
  assert.ok(!renderNotice(n).text.includes("60 days"));
});
