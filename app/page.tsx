import { POLICY } from '@/lib/policy';
import { canAcceptAcknowledgments } from '@/lib/ready';
import { AcknowledgmentForm } from '@/components/acknowledgment-form';

export const dynamic = 'force-dynamic';

function HomeIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.5 10 8.5-7 8.5 7v10.25a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75V10Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M9 21v-8h6v8" stroke="currentColor" strokeWidth="1.4"/></svg>;
}

export default function Page() {
  const ready = canAcceptAcknowledgments();
  const requiresCode = Boolean(process.env.ACCESS_CODE);
  return <main>
    <header className="masthead"><div className="layout-width masthead-inner">
      <a href="#top" className="brand"><span className="brand-icon"><HomeIcon /></span><span><strong>BACK ACRES</strong><small>RENTAL PROPERTY</small></span></a>
      <span className="location-top">AMARILLO, TEXAS <span className="location-dot">•</span> PRIVATE APPLICATION NOTICE</span>
    </div></header>

    <div id="top" className="layout-width">
      <section className="hero" aria-labelledby="main-heading">
        <div><div className="eyebrow"><span className="line" /> APPLICATION INFORMATION <span className="bullet">/</span> DOCUMENT 01</div>
          <h1 id="main-heading">Tenant selection<br /><em>criteria & acknowledgment.</em></h1>
          <p className="hero-lede">Before applying for this property, please review the criteria we use to evaluate rental applications. When you're finished, acknowledge that you've had an opportunity to read them.</p>
        </div>
        <aside className="property-card"><div className="property-overline">PROPERTY DETAILS</div><div className="property-address">7800 Back Acres Rd</div><div className="property-city">Amarillo, TX 79119</div><div className="property-line" /><div className="property-rent-label">MONTHLY RENT</div><div className="property-rent">$2,500 <span>/ month</span></div></aside>
      </section>

      {!ready && <div className="draft-banner" role="status"><span className="draft-dot" /><div><strong>Draft preview — submissions disabled</strong><p>The landlord must review and finalize these proposed criteria and configure email delivery before this form can accept acknowledgments.</p></div></div>}

      <div className="content-grid">
        <aside className="sidebar"><div className="sidebar-label">IN THIS DOCUMENT</div>
          <a href="#criteria" className="step"><span>01</span> Selection criteria</a>
          <a href="#important-notice" className="step"><span>02</span> Important notice</a>
          <a href="#acknowledge" className="step"><span>03</span> Acknowledgment</a>
          <div className="sidebar-meta"><span>VERSION</span><strong>{POLICY.version}</strong><span>LAST UPDATED</span><strong>{POLICY.revised}</strong></div>
        </aside>

        <article className="document-content">
          <section id="criteria" className="criteria-section"><div className="section-kicker">01 — THE REVIEW PROCESS</div><h2>What we look at.</h2><p className="section-intro">Each completed application is evaluated using the same published standards, in accordance with applicable law. Supporting records may be requested to verify information.</p>
            <div className="criteria-list">{POLICY.items.map((item)=><div className="criterion" key={item.number}><div className="criterion-number">{item.number}</div><div><h3>{item.title}</h3><p>{item.detail}</p></div></div>)}</div>
          </section>
          <section id="important-notice" className="statutory-section"><div className="section-kicker">02 — IMPORTANT NOTICE</div><h2>Notice of eligibility requirements.</h2><p className="section-intro">Texas Property Code § 92.3515 requires disclosure of tenant-selection criteria and an acknowledgment of the opportunity to review them.</p><div className="statutory-box"><div className="box-kicker">REQUIRED ACKNOWLEDGMENT LANGUAGE</div><p><strong>{POLICY.statutoryAcknowledgment}</strong></p></div><p className="small-note">This document is not a lease, a promise to rent, or an approval of an application. Any decision will be made separately under applicable law. Please keep a copy for your records.</p><div className="print-actions"><a href="https://statutes.capitol.texas.gov/Docs/PR/htm/PR.92.htm#92.3515" target="_blank" rel="noreferrer">Texas Property Code § 92.3515 <span aria-hidden="true">↗</span></a><span>•</span><span>To print this notice, use your browser's Print command.</span></div></section>
          <section id="acknowledge" className="ack-section"><div className="section-kicker">03 — YOUR ACKNOWLEDGMENT</div><h2>Confirm you’ve reviewed it.</h2><p className="section-intro">Enter your information exactly as it appears on your rental application. You'll receive a confirmation by email; the landlord and co-owner will receive copies as well.</p><AcknowledgmentForm ready={ready} requiresCode={requiresCode} version={POLICY.version} /></section>
        </article>
      </div>
    </div>
    <footer><div className="layout-width footer-inner"><span>© {new Date().getFullYear()} Back Acres Rental</span><span>{POLICY.street} · {POLICY.city}</span><span>Questions? Contact the property owner.</span></div></footer>
  </main>;
}
