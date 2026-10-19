import { escapeHtml } from "./receipt";

const urlPattern = /https?:\/\/[^\s<>"']+/g;
const paragraphBreak = /\n{2,}/;

export interface EmailBrand {
  /** Text color that reads on `color` (light or dark). */
  buttonInk: string;
  /** Primary brand color as hex; email clients do not support oklch(). */
  color: string;
  /** Absolute URL of the PNG logo, or null when no logo is saved. */
  logoUrl: string | null;
  name: string;
}

export const defaultEmailBrand: EmailBrand = {
  buttonInk: "#ffffff",
  color: "#103e35",
  logoUrl: null,
  name: "Back Acres Rental",
};

/**
 * A call-to-action button that works in Outlook and Gmail (table-based, no
 * CSS classes), followed by the plain link for clients that block buttons.
 */
export function emailButtonHtml(brand: EmailBrand, label: string, url: string) {
  const href = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="background:${brand.color};border-radius:3px"><a href="${href}" style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;line-height:1;color:${brand.buttonInk};text-decoration:none;border-radius:3px">${escapeHtml(label)}</a></td></tr></table>
<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#5b6670">Button not working? Copy this link into your browser:<br><a href="${href}" style="color:#5b6670;word-break:break-all">${href}</a></p>`;
}

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
    <div style="padding:20px 28px;border-bottom:3px solid ${brand.color}">${logo}<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${brand.color}">${name}</p></div>
    <div style="padding:24px 28px;font-size:15px;line-height:1.6">${body}</div>
  </div>
</div>`;
}
