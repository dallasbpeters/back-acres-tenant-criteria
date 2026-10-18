import { escapeHtml } from "./receipt";

const urlPattern = /https?:\/\/[^\s<>"']+/g;
const paragraphBreak = /\n{2,}/;

export interface EmailBrand {
  /** Absolute URL of the PNG logo, or null when no logo is saved. */
  logoUrl: string | null;
  name: string;
}

export const defaultEmailBrand: EmailBrand = {
  logoUrl: null,
  name: "Back Acres Rental",
};

/** Converts a plain-text email body to escaped HTML with clickable links. */
export function textEmailHtml(text: string) {
  return text
    .split(paragraphBreak)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(
        urlPattern,
        (url) => `<a href="${url}" style="color:#2f5d46">${url}</a>`
      );
      return `<p style="margin:0 0 16px;white-space:pre-wrap;word-break:break-word">${escaped}</p>`;
    })
    .join("");
}

/**
 * Wraps an email body in the saved app branding. Email clients do not render
 * SVG, so the logo is always the PNG the branding upload produced.
 */
export function brandedEmailHtml(brand: EmailBrand, body: string) {
  const name = escapeHtml(brand.name);
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name} logo" height="48" style="display:block;height:48px;width:auto;max-width:240px;border:0;margin:0 0 10px">`
    : "";
  return `<div style="background:#f6f4ee;padding:24px 12px;font-family:Georgia,serif;color:#1c2931">
  <div style="max-width:680px;margin:auto;background:#ffffff;border:1px solid #d4dadd">
    <div style="padding:20px 28px;border-bottom:3px solid #2f5d46">${logo}<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#2f5d46">${name}</p></div>
    <div style="padding:24px 28px;font-size:15px;line-height:1.6">${body}</div>
  </div>
</div>`;
}
