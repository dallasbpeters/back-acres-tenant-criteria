import { z } from "zod";
import { noticeTemplateIds, noticeTemplateRevision } from "./templates";

export type RichNode = {
  type: string;
  text?: string;
  content?: RichNode[];
  marks?: { type: string }[];
};
const node: z.ZodType<RichNode> = z.lazy(() =>
  z.object({
    type: z.enum([
      "doc",
      "paragraph",
      "text",
      "bulletList",
      "orderedList",
      "listItem",
      "hardBreak",
    ]),
    text: z.string().max(12000).optional(),
    content: z.array(node).max(100).optional(),
    marks: z
      .array(z.object({ type: z.enum(["bold", "italic"]) }))
      .max(2)
      .optional(),
  }),
);
const short = z.string().trim().max(300);
export const noticeSchema = z.object({
  template: z
    .object({
      id: z.enum(noticeTemplateIds),
      revision: z.literal(noticeTemplateRevision),
    })
    .optional(),
  applicantName: short,
  applicantEmail: z.string().trim().max(254),
  property: short,
  noticeDate: z.string().max(10),
  senderName: short,
  senderContact: z.string().trim().max(1000),
  action: z.enum([
    "Application denied",
    "Co-signer required",
    "Higher security deposit required",
    "Higher rent required",
    "Other",
  ]),
  actionDetails: z.string().trim().max(2000),
  reasons: node,
  reportUsed: z.boolean(),
  agencies: z
    .array(
      z.object({
        name: short,
        address: z.string().trim().max(1000),
        phone: short,
      }),
    )
    .max(10),
  scoreUsed: z.boolean(),
  score: short,
  scoreMin: short,
  scoreMax: short,
  scoreDate: z.string().max(10),
  scoreSource: short,
  scoreFactors: z.string().trim().max(3000),
});
export type Notice = z.infer<typeof noticeSchema>;
export const blankNotice = (): Notice => ({
  applicantName: "",
  applicantEmail: "",
  property: "7800 Back Acres Rd, Amarillo, TX 79119",
  noticeDate: new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
  }).format(new Date()),
  senderName: "Back Acres Rental",
  senderContact: "",
  action: "Application denied",
  actionDetails: "",
  reasons: { type: "doc", content: [{ type: "paragraph" }] },
  reportUsed: true,
  agencies: [{ name: "", address: "", phone: "" }],
  scoreUsed: false,
  score: "",
  scoreMin: "",
  scoreMax: "",
  scoreDate: "",
  scoreSource: "",
  scoreFactors: "",
});
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function richText(n: RichNode): string {
  return n.type === "text"
    ? n.text || ""
    : n.type === "hardBreak"
      ? "\n"
      : (n.content || [])
          .map(richText)
          .join(
            ["doc", "bulletList", "orderedList"].includes(n.type) ? "\n" : "",
          );
}
export function richHtml(n: RichNode): string {
  if (n.type === "text")
    return (n.marks || []).reduce(
      (s, m) => (m.type === "bold" ? `<strong>${s}</strong>` : `<em>${s}</em>`),
      escapeHtml(n.text || ""),
    );
  if (n.type === "hardBreak") return "<br>";
  const tags: Record<string, string> = {
    paragraph: "p",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
  };
  const body = (n.content || []).map(richHtml).join("");
  const tag = tags[n.type];
  return tag ? `<${tag}>${body}</${tag}>` : body;
}
const rights =
  "You have the right to dispute the accuracy or completeness of information in your consumer report with the reporting agency. You also have the right to obtain a free copy of your report from the agency if you request it within 60 days of receiving this notice.";
const disclaimer =
  "The reporting agency did not make this decision and cannot explain the specific reasons for it.";
export function sendErrors(n: Notice): string[] {
  const errors: string[] = [];
  for (const [label, value] of [
    ["Applicant name", n.applicantName],
    ["Property", n.property],
    ["Sender name", n.senderName],
    ["Sender contact", n.senderContact],
  ])
    if (!value.trim()) errors.push(`${label} is required.`);
  if (!z.string().email().safeParse(n.applicantEmail).success)
    errors.push("A valid applicant email is required.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(n.noticeDate) ||
    Number.isNaN(Date.parse(n.noticeDate))
  )
    errors.push("A valid notice date is required.");
  if (!richText(n.reasons).trim())
    errors.push("Enter the reasons for the decision.");
  if (n.action !== "Application denied" && !n.actionDetails)
    errors.push("Describe the required terms or other action.");
  if (
    n.reportUsed &&
    (!n.agencies.length ||
      n.agencies.some((a) => !a.name || !a.address || !a.phone))
  )
    errors.push(
      "Complete the name, address, and phone for every reporting agency used. Include its toll-free number when applicable.",
    );
  if (n.scoreUsed && !n.reportUsed)
    errors.push("A credit score requires consumer-report disclosures.");
  if (
    n.scoreUsed &&
    (![n.score, n.scoreMin, n.scoreMax].every((s) => /^\d+$/.test(s)) ||
      Number(n.scoreMin) >= Number(n.scoreMax) ||
      Number(n.score) < Number(n.scoreMin) ||
      Number(n.score) > Number(n.scoreMax) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(n.scoreDate) ||
      !n.scoreSource ||
      !n.scoreFactors)
  )
    errors.push(
      "Complete the credit score, valid range, creation date, source, and key factors in order of importance.",
    );
  return errors;
}
export function renderNotice(n: Notice) {
  const paragraphs = [
    n.senderName,
    n.senderContact,
    "Adverse action notice",
    `Date: ${n.noticeDate}`,
    `To: ${n.applicantName}`,
    `Property: ${n.property}`,
    `Decision: ${n.action}`,
    n.actionDetails,
    "Reasons for this decision",
    richText(n.reasons),
  ];
  if (n.reportUsed)
    paragraphs.push(
      "This decision was based in whole or in part on information in a consumer report.",
      ...n.agencies.map(
        (a) => `${a.name}\n${a.address}\n${a.phone}\n${disclaimer}`,
      ),
      rights,
    );
  if (n.scoreUsed)
    paragraphs.push(
      "Credit score disclosure",
      `Score: ${n.score} (range ${n.scoreMin}–${n.scoreMax})`,
      `Created: ${n.scoreDate}\nSource: ${n.scoreSource}`,
      `Key factors affecting the score, in order of importance:\n${n.scoreFactors}`,
    );
  const text = paragraphs.filter(Boolean).join("\n\n");
  const p = (value: string) =>
    value
      ? `<p style="white-space:pre-wrap;margin:16px 0">${escapeHtml(value)}</p>`
      : "";
  const heading = (value: string) =>
    `<h2 style="font-size:18px;margin:24px 0 12px">${escapeHtml(value)}</h2>`;
  const html = `<article style="font-family:Georgia,serif;color:#263b31;max-width:680px;margin:auto;line-height:1.6">${p(n.senderName)}${p(n.senderContact)}<h1 style="font-size:28px;border-bottom:1px solid #bbc8bf;padding-bottom:20px;margin:24px 0">Adverse action notice</h1>${p(`Date: ${n.noticeDate}\nTo: ${n.applicantName}\nProperty: ${n.property}`)}${heading(n.action)}${p(n.actionDetails)}${heading("Reasons for this decision")}${richHtml(n.reasons)}${n.reportUsed ? heading("Consumer report information") + p("This decision was based in whole or in part on information in a consumer report.") + n.agencies.map((a) => p(`${a.name}\n${a.address}\n${a.phone}`) + p(disclaimer)).join("") + p(rights) : ""}${n.scoreUsed ? heading("Credit score disclosure") + p(`Score: ${n.score} (range ${n.scoreMin}–${n.scoreMax})\nCreated: ${n.scoreDate}\nSource: ${n.scoreSource}`) + p(`Key factors affecting the score, in order of importance:\n${n.scoreFactors}`) : ""}</article>`;
  return { subject: `Adverse action notice — ${n.property}`, text, html };
}
