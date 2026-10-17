import type { ReactNode } from 'react';
import { POLICY } from '@/lib/policy';
export function LegalDocument({ title, introduction, children }: { title: string; introduction: string; children: ReactNode }) {
  return <main className="legal-document">
    <header className="masthead"><div className="layout-width masthead-inner"><a className="brand" href="/"><span className="brand-monogram" aria-hidden="true">BA</span><span><strong>Back Acres</strong><small>Rental property · Amarillo, Texas</small></span></a><a href="/">Tenant selection criteria</a></div></header>
    <article className="layout-width legal-body"><div className="document-heading"><p className="eyebrow">Website information · Effective October 17, 2026</p><h1>{title}</h1><p className="hero-lede">{introduction}</p><p className="small-note">{POLICY.street} · {POLICY.city}</p></div>{children}</article>
  </main>;
}
export function LegalContact() { return <p>Contact the Back Acres property owner at <a href="mailto:dallaspeters@gmail.com">dallaspeters@gmail.com</a>. For privacy requests, identify the record or account involved. Please do not email Social Security numbers, full financial account numbers, passwords, or complete consumer reports.</p>; }
