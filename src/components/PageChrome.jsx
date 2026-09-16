import React from 'react';

export function PageHeader({ section, page, status = 'local only' }) {
  const label = ['d0u9', section, page].filter(Boolean).join(' / ');
  const href = page ? `/${section}/` : '/';

  return (
    <header className="topbar">
      <a className="brand" href={href}>
        <span className="brand-mark" />
        <span>{label}</span>
      </a>
      <div className="status mono">
        <span className="status-dot" />
        <span>{status}</span>
      </div>
    </header>
  );
}

export function BackLink({ href, children }) {
  return (
    <a className="back-link" href={href}>
      <span aria-hidden="true">←</span>
      <span>{children}</span>
    </a>
  );
}

export function DetailIntro({ backHref, backLabel, eyebrow, title, description, children }) {
  return (
    <section className="detail-intro">
      <div className="detail-intro-main">
        <BackLink href={backHref}>{backLabel}</BackLink>
        <div className="detail-intro-copy">
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children && <div className="detail-intro-aside">{children}</div>}
    </section>
  );
}

export function CollectionHero({ eyebrow, title, mutedTitle, description }) {
  return (
    <section className="collection-hero">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}<br /><span>{mutedTitle}</span></h1>
      <p>{description}</p>
    </section>
  );
}

export function CollectionCard({ className = '', eyebrow, glyph, title, description, meta, href, onClick }) {
  return (
    <a className={`collection-card ${className}`} href={href} onClick={onClick}>
      <div className="collection-card-top mono"><span>{eyebrow}</span><span>↗</span></div>
      <div className="collection-glyph mono" aria-hidden="true">{glyph}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {meta && <div className="collection-meta mono">{meta}</div>}
    </a>
  );
}
