import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Only fonts that can actually render differently belong here: "Maple Mono NF"
// is expected to be installed locally (no @font-face is bundled for it); every
// other name below has no matching @font-face/local install in this project,
// so listing them just silently falls back and looks like "nothing happened".
const FONT_OPTIONS = [
  { label: 'Maple Mono NF', value: '"Maple Mono NF", "Maple Mono NF CN", ui-monospace, SFMono-Regular, Menlo, monospace' },
  { label: 'System Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Monaco', value: 'Monaco, "Courier New", monospace' },
  { label: 'Menlo', value: 'Menlo, Monaco, monospace' },
  { label: 'Andale Mono', value: '"Andale Mono", Monaco, monospace' },
  { label: 'PT Mono', value: '"PT Mono", "Courier New", monospace' }
];
const FONT_SIZES = [12, 13, 14, 15, 16, 18];

function useCodeFontPrefs() {
  const [family, setFamily] = useState(() => {
    try {
      const stored = localStorage.getItem('d0u9-code-font');
      return FONT_OPTIONS.some(opt => opt.value === stored) ? stored : FONT_OPTIONS[0].value;
    } catch { return FONT_OPTIONS[0].value; }
  });
  const [size, setSize] = useState(() => { try { return Number(localStorage.getItem('d0u9-code-font-size')) || 14; } catch { return 14; } });
  useEffect(() => {
    document.documentElement.style.setProperty('--code-font-family', family);
    try { localStorage.setItem('d0u9-code-font', family); } catch {}
  }, [family]);
  useEffect(() => {
    document.documentElement.style.setProperty('--code-font-size', `${size}px`);
    try { localStorage.setItem('d0u9-code-font-size', String(size)); } catch {}
  }, [size]);
  return { family, setFamily, size, setSize };
}

export function FontControls() {
  const { family, setFamily, size, setSize } = useCodeFontPrefs();
  return (
    <div className="font-controls">
      <select className="font-select" value={family} onChange={event => setFamily(event.target.value)} aria-label="Code font" title="Code font">
        {FONT_OPTIONS.map(opt => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
      </select>
      <select className="font-select font-size-select" value={size} onChange={event => setSize(Number(event.target.value))} aria-label="Code font size" title="Code font size">
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
      </select>
    </div>
  );
}

export function LineNumberedField({ value, onChange, readOnly, placeholder, spellCheck = 'false', autoFocus, wrap = false, className = '' }) {
  const gutterRef = useRef(null);
  const textareaRef = useRef(null);
  const mirrorRef = useRef(null);
  const syncingRef = useRef(false);
  const [rowHeights, setRowHeights] = useState(null);
  const lines = (value || '').split('\n');

  // With wrap on, one logical line can occupy several visual rows, so each
  // gutter entry must be as tall as its wrapped line or the two columns drift
  // apart as you scroll. The mirror reproduces the textarea's text box and
  // reports the real per-line heights.
  useLayoutEffect(() => {
    const mirror = mirrorRef.current, textarea = textareaRef.current;
    if (!mirror || !textarea) return;
    if (!wrap) { setRowHeights(prev => prev === null ? prev : null); return; }
    const styles = getComputedStyle(textarea);
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.font = styles.font;
    mirror.style.letterSpacing = styles.letterSpacing;
    mirror.style.paddingLeft = styles.paddingLeft;
    mirror.style.paddingRight = styles.paddingRight;
    mirror.style.wordBreak = styles.wordBreak;
    const measured = Array.from(mirror.children, (child) => child.getBoundingClientRect().height);
    setRowHeights(prev => (prev && prev.length === measured.length && prev.every((h, i) => h === measured[i])) ? prev : measured);
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setRowHeights(prev => (prev ? [...prev] : prev)));
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  const onTextareaScroll = (event) => {
    if (syncingRef.current) { syncingRef.current = false; return; }
    if (gutterRef.current) { syncingRef.current = true; gutterRef.current.scrollTop = event.target.scrollTop; }
  };
  const onGutterScroll = (event) => {
    if (syncingRef.current) { syncingRef.current = false; return; }
    if (textareaRef.current) { syncingRef.current = true; textareaRef.current.scrollTop = event.target.scrollTop; }
  };

  return (
    <div className="line-field">
      <div className="line-gutter mono" ref={gutterRef} onScroll={onGutterScroll} aria-hidden="true">
        {lines.map((_, index) => <div key={index} style={rowHeights && rowHeights[index] ? { height: `${rowHeights[index]}px` } : undefined}>{index + 1}</div>)}
      </div>
      <textarea
        ref={textareaRef}
        className={`${className} ${wrap ? 'wrap-on' : 'wrap-off'}`}
        value={value}
        onChange={onChange}
        onScroll={onTextareaScroll}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={spellCheck}
        autoFocus={autoFocus}
      />
      <div className="line-mirror mono" ref={mirrorRef} aria-hidden="true">
        {lines.map((line, index) => <div key={index}>{line === '' ? '​' : line}</div>)}
      </div>
    </div>
  );
}

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

export function DetailIntro({ backHref, backLabel, eyebrow, title, description, scrollLabel = 'scroll down to use', children }) {
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
      <div className="scroll-cue mono" aria-hidden="true">
        <span>{scrollLabel}</span>
        <span>↓</span>
      </div>
    </section>
  );
}

export function ToolHeader({ backHref, backLabel, eyebrow, title, status = 'local only' }) {
  return (
    <header className="tool-topbar">
      <a className="brand-mark-link" href="/" aria-label="d0u9 home"><span className="brand-mark" /></a>
      <BackLink href={backHref}>{backLabel}</BackLink>
      <div className="tool-topbar-title">
        <span className="eyebrow-mini">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <FontControls />
      <div className="status mono">
        <span className="status-dot" />
        <span>{status}</span>
      </div>
    </header>
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
