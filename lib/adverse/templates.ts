import type { Notice, RichNode } from "./notice";

export const noticeTemplateRevision = "2026-10-17.1";
export const noticeTemplateSources = {
  ftc: {
    title: "FTC: Using Consumer Reports — What Landlords Need to Know",
    url: "https://www.ftc.gov/business-guidance/resources/using-consumer-reports-what-landlords-need-know",
  },
  fcra: {
    title: "15 U.S.C. § 1681m(a): Consumer-report adverse-action disclosures",
    url: "https://www.law.cornell.edu/uscode/text/15/1681m",
  },
  texas: {
    title: "Texas Property Code § 92.3515: Disclosed tenant selection criteria",
    url: "https://tcss.legis.texas.gov/docs/PR/htm/PR.92.htm#92.3515",
  },
};
export const noticeTemplates = [
  {
    id: "report-denial",
    title: "Application denied · consumer report",
    action: "Application denied",
    report: true,
    reason:
      "Your rental application has been denied. Information from a consumer report contributed to this decision.",
    sources: ["ftc", "fcra"],
  },
  {
    id: "report-cosigner",
    title: "Conditional approval · co-signer",
    action: "Co-signer required",
    report: true,
    reason:
      "Your rental application requires a co-signer. Information from a consumer report contributed to the requirement for a co-signer.",
    sources: ["ftc", "fcra"],
  },
  {
    id: "report-deposit",
    title: "Conditional approval · higher deposit",
    action: "Higher security deposit required",
    report: true,
    reason:
      "Your rental application requires a higher security deposit. Information from a consumer report contributed to this deposit requirement.",
    sources: ["ftc", "fcra"],
  },
  {
    id: "report-rent",
    title: "Conditional approval · higher rent",
    action: "Higher rent required",
    report: true,
    reason:
      "Your rental application requires a higher monthly rental amount. Information from a consumer report contributed to this rental requirement.",
    sources: ["ftc", "fcra"],
  },
  {
    id: "income-denial",
    title: "Application denied · income criteria",
    action: "Application denied",
    report: false,
    reason:
      "Your rental application has been denied because the verified income information did not meet the income requirement in the tenant selection criteria provided for this property.",
    sources: ["texas"],
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
  specificReason = "",
): Notice {
  const template = noticeTemplates.find((t) => t.id === id)!;
  if (template.action !== "Application denied" && !terms.trim())
    throw Error(
      "Enter the actual required terms before applying this template.",
    );
  const paragraphs = [template.reason, specificReason.trim()].filter(Boolean);
  const reasons: RichNode = {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
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
