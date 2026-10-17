import { POLICY } from '@/lib/policy';
import { canAcceptAcknowledgments } from '@/lib/ready';
import { AcknowledgmentForm } from '@/components/acknowledgment-form';

export const dynamic = 'force-dynamic';

export default function Page() {
  const ready = canAcceptAcknowledgments();
  const requiresCode = Boolean(process.env.ACCESS_CODE);

  return <main id="top">
    <a className="skip-link" href="#criteria">Skip to selection criteria</a>
    <header className="masthead">
      <div className="layout-width masthead-inner">
        <a href="#top" className="brand"><span className="brand-monogram" aria-hidden="true">BA</span><span><strong>Back Acres</strong><small>Rental property · Amarillo, Texas</small></span></a>
        <span className="location-top">Applicant documents <span aria-hidden="true">/</span> 01</span>
      </div>
    </header>

    <div className="layout-width">
      <section className="hero" aria-labelledby="main-heading">
        <div className="document-heading">
          <p className="eyebrow">Residential rental · Application notice</p>
          <h1 id="main-heading">Tenant selection criteria <span>& acknowledgment</span></h1>
          <p className="hero-lede">Review the selection criteria before applying. Each adult applicant must acknowledge that they have had an opportunity to read this notice.</p>
        </div>
        <dl className="document-details">
          <div><dt>Property</dt><dd>{POLICY.street}<span>{POLICY.city}</span></dd></div>
          <div><dt>Monthly rent</dt><dd className="property-rent">${POLICY.rent.toLocaleString('en-US')}<span>Per month</span></dd></div>
          <div><dt>Last revised</dt><dd>{POLICY.revised}<span className="policy-version">{POLICY.version}</span></dd></div>
        </dl>
      </section>

      {!ready && <div className="draft-banner" role="status"><strong>Acknowledgments temporarily unavailable</strong><p>You can review the final criteria below. Please contact the property owner if you need to submit an acknowledgment.</p></div>}

      <div className="content-grid">
        <aside className="sidebar">
          <nav aria-label="Document sections">
            <p className="sidebar-label">Contents</p>
            <a href="#criteria" className="step"><span>01</span> Selection criteria</a>
            <a href="#important-notice" className="step"><span>02</span> Required notice</a>
            <a href="#acknowledge" className="step"><span>03</span> Acknowledgment</a>
          </nav>
          <p className="sidebar-note">For your records<br /><span>Use your browser’s Print command to save or print this notice.</span></p>
        </aside>

        <article className="document-content" aria-label="Tenant selection notice">
          <section id="criteria" className="criteria-section">
            <div className="section-heading"><span className="section-number" aria-hidden="true">01</span><h2>Selection criteria</h2></div>
            <p className="section-intro">Each completed application is evaluated using the same published standards, in accordance with applicable law. Supporting records may be requested to verify information.</p>
            <div className="criteria-list">{POLICY.items.map((item) => <div className="criterion" key={item.number}>
              <div className="criterion-number" aria-hidden="true">{item.number}</div>
              <div><h3>{item.title}</h3><p>{item.detail}</p></div>
            </div>)}</div>
          </section>

          <section id="important-notice" className="statutory-section">
            <div className="section-heading"><span className="section-number" aria-hidden="true">02</span><h2>Notice of eligibility requirements</h2></div>
            <p className="section-intro">Texas Property Code § 92.3515 requires disclosure of tenant-selection criteria and an acknowledgment of the opportunity to review them.</p>
            <div className="statutory-box"><p className="box-kicker">Required acknowledgment language</p><p><strong>{POLICY.statutoryAcknowledgment}</strong></p></div>
            <p className="small-note">This document is not a lease, a promise to rent, or an approval of an application. Any decision will be made separately under applicable law. Please keep a copy for your records.</p>
            <div className="print-actions"><a href="https://statutes.capitol.texas.gov/Docs/PR/htm/PR.92.htm#92.3515" target="_blank" rel="noreferrer">Texas Property Code § 92.3515 <span aria-hidden="true">↗</span></a></div>
          </section>

          <section id="acknowledge" className="ack-section">
            <div className="section-heading"><span className="section-number" aria-hidden="true">03</span><h2>Applicant acknowledgment</h2></div>
            <p className="section-intro">Enter your information as it appears on your rental application. A confirmation will be emailed to you and copied to the property owners.</p>
            <AcknowledgmentForm ready={ready} requiresCode={requiresCode} version={POLICY.version} />
          </section>
        </article>
      </div>
    </div>
    <footer><div className="layout-width footer-inner"><span>Back Acres Rental · {new Date().getFullYear()}</span><span>{POLICY.street} · {POLICY.city}</span><span>Tenant criteria, acknowledgments, and private owner correspondence.</span></div></footer>
  </main>;
}
