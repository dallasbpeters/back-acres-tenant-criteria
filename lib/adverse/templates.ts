import { requireValue } from "@/lib/required";

import type { Notice, RichNode } from "./notice";

export const noticeTemplateRevision = "2026-10-17.1";
export const noticeTemplateSources = {
  fcra: {
    title: "15 U.S.C. § 1681m(a): Consumer-report adverse-action disclosures",
    url: "https://www.law.cornell.edu/uscode/text/15/1681m",
  },
  ftc: {
    title: "FTC: Using Consumer Reports — What Landlords Need to Know",
    url: "https://www.ftc.gov/business-guidance/resources/using-consumer-reports-what-landlords-need-know",
  },
  texas: {
    title: "Texas Property Code § 92.3515: Disclosed tenant selection criteria",
    url: "https://tcss.legis.texas.gov/docs/PR/htm/PR.92.htm#92.3515",
  },
};
export const noticeTemplates = [
  {
    action: "Application denied",
    id: "report-denial",
    reason:
      "Your rental application has been denied. Information from a consumer report contributed to this decision.",
    report: true,
    sources: ["ftc", "fcra"],
    title: "Application denied · consumer report",
  },
  {
    action: "Co-signer required",
    id: "report-cosigner",
    reason:
      "Your rental application requires a co-signer. Information from a consumer report contributed to the requirement for a co-signer.",
    report: true,
    sources: ["ftc", "fcra"],
    title: "Conditional approval · co-signer",
  },
  {
    action: "Higher security deposit required",
    id: "report-deposit",
    reason:
      "Your rental application requires a higher security deposit. Information from a consumer report contributed to this deposit requirement.",
    report: true,
    sources: ["ftc", "fcra"],
    title: "Conditional approval · higher deposit",
  },
  {
    action: "Higher rent required",
    id: "report-rent",
    reason:
      "Your rental application requires a higher monthly rental amount. Information from a consumer report contributed to this rental requirement.",
    report: true,
    sources: ["ftc", "fcra"],
    title: "Conditional approval · higher rent",
  },
  {
    action: "Application denied",
    id: "income-denial",
    reason:
      "Your rental application has been denied because the verified income information did not meet the income requirement in the tenant selection criteria provided for this property.",
    report: false,
    sources: ["texas"],
    title: "Application denied · income criteria",
  },
] as const;
export const noticeTemplateIds = [
  "report-denial",
  "report-cosigner",
  "report-deposit",
  "report-rent",
  "income-denial",
] as const;
export type NoticeTemplateId = (typeof noticeTemplateIds)[number];
/** Original draft wording based on the cited rules; no attorney approval is claimed. */
export function applyNoticeTemplate(
  notice: Notice,
  id: NoticeTemplateId,
  terms = "",
  specificReason = ""
): Notice {
  const template = requireValue(
    noticeTemplates.find((t) => t.id === id),
    "Expected noticeTemplates.find((t) => t.id === id)"
  );
  if (template.action !== "Application denied" && !terms.trim()) {
    throw new Error(
      "Enter the actual required terms before applying this template."
    );
  }
  const paragraphs = [template.reason, specificReason.trim()].filter(Boolean);
  const reasons: RichNode = {
    content: paragraphs.map((text) => ({
      content: [{ text, type: "text" }],
      type: "paragraph",
    })),
    type: "doc",
  };
  return {
    ...notice,
    action: template.action,
    actionDetails: template.action === "Application denied" ? "" : terms.trim(),
    reasons,
    // Never silently remove disclosures or score information already entered.
    reportUsed: template.report || notice.reportUsed,
    template: { id, revision: noticeTemplateRevision },
  };
}
