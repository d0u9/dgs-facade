import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientCursor from './components/AmbientCursor.jsx';
import { CollectionCard, CollectionHero, LineNumberedField, PageHeader, ToolHeader } from './components/PageChrome.jsx';
import { DEFAULT_SOURCE_ID, FALLBACK_NAMES, ISO_CODES, SERIES_RANGES, SERIES_SOURCE_LABEL, SOURCES, cachedNames, cachedRates, fetchNames, fetchRates, fetchSeries, isStale, readStoredSourceId, sourceById, storeSourceId } from './fx.js';
import './styles.css';

const TOOLS = [
  { title: 'Base64', eyebrow: '01 / encode + decode', description: 'Convert text and Base64 locally, with full Unicode support.', href: '/utilities/base64/', glyph: 'Aa' },
  { title: 'File Diff', eyebrow: '02 / compare text', description: 'Compare two blocks of text and see line-by-line changes.', href: '/utilities/filediff/', glyph: '≠' },
  { title: 'JSON Formatter', eyebrow: '03 / format + validate', description: 'Pretty-print, minify, and validate JSON locally.', href: '/utilities/jsonformat/', glyph: '{}' },
  { title: 'Currency', eyebrow: '04 / live conversion', description: 'Type in any currency and every other one follows.', href: '/utilities/currency/', glyph: '¤', meta: 'DAILY RATES' },
];

function UtilitiesHub() {
  return <main className="section-shell utility-shell">
    <PageHeader section="utilities" />
    <CollectionHero eyebrow="browser utilities" title="Useful things." mutedTitle="Nothing leaves." description="Small tools that work entirely on this device. Your input is never uploaded or stored." />
    <section className="collection-grid">{TOOLS.map(tool=><CollectionCard className="utility-card" eyebrow={tool.eyebrow} glyph={tool.glyph} title={tool.title} description={tool.description} meta={tool.meta || "RUNS LOCALLY"} href={tool.href} key={tool.href} />)}</section>
    <footer className="footer"><span>processed on this device</span><a href="/">back home</a></footer>
  </main>;
}

function WrapToggle({ wrap, setWrap }) {
  return <button className={`btn wrap-toggle ${wrap?'active':''}`} onClick={()=>setWrap(w=>!w)} title="Toggle line wrap">wrap</button>;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const clean = value.replace(/\s/g, '');
  const binary = atob(clean);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function Base64Tool() {
  const [source, setSource] = useState('');
  const [mode, setMode] = useState('encode');
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => {
    if (!source) return { value: '', error: '' };
    try {
      const value = mode === 'encode'
        ? bytesToBase64(new TextEncoder().encode(source))
        : new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(source));
      return { value, error: '' };
    } catch {
      return { value: '', error: mode === 'decode' ? 'This is not valid UTF-8 Base64.' : 'Unable to encode this text.' };
    }
  }, [source, mode]);
  const swap = () => { if (result.value) setSource(result.value); setMode(current => current === 'encode' ? 'decode' : 'encode'); };
  const copy = async () => { if (!result.value) return; await navigator.clipboard.writeText(result.value); setCopied(true); window.setTimeout(()=>setCopied(false), 1200); };
  return <main className="tool-shell">
    <ToolHeader backHref="/utilities/" backLabel="Utilities" eyebrow="01 / encode + decode" title="Base64" />
    <section className="tool-panel"><div className="codec-card">
      <div className="codec-toolbar">
        <div className="codec-toolbar-left"><div className="mode-switch" role="group" aria-label="Conversion mode"><button className={mode==='encode'?'active':''} onClick={()=>setMode('encode')}>encode</button><button className={mode==='decode'?'active':''} onClick={()=>setMode('decode')}>decode</button></div><span className="mono codec-stat">{source.length.toLocaleString()} chars · {result.value.length.toLocaleString()} output</span></div>
        <div className="codec-toolbar-right"><WrapToggle wrap={wrap} setWrap={setWrap}/><button className="btn" onClick={swap} disabled={!result.value}>swap</button><button className="btn" onClick={()=>setSource('')} disabled={!source}>clear</button><button className="btn primary" onClick={copy} disabled={!result.value}>{copied?'copied':'copy'}</button></div>
      </div>
      <div className="codec-grid">
        <label><span className="mono">{mode === 'encode' ? 'plain text' : 'base64 input'}</span><LineNumberedField value={source} onChange={event=>setSource(event.target.value)} placeholder={mode==='encode'?'Type or paste text…':'Paste Base64…'} wrap={wrap} autoFocus/></label>
        <label><span className="mono">{mode === 'encode' ? 'base64 output' : 'decoded text'}</span><LineNumberedField value={result.error || result.value} readOnly className={result.error?'has-error':''} placeholder="Result appears here…" wrap={wrap}/></label>
      </div>
    </div></section>
  </main>;
}

function diffLines(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'context', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'remove', text: a[i] }); i++; }
    else { ops.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) { ops.push({ type: 'remove', text: a[i] }); i++; }
  while (j < m) { ops.push({ type: 'add', text: b[j] }); j++; }
  return ops;
}

function buildInlineRuns(ops, keepTypes) {
  const runs = [];
  let buf = '', bufType = null;
  for (const op of ops) {
    if (!keepTypes.includes(op.type)) continue;
    if (op.type !== bufType) { if (buf) runs.push({ type: bufType, text: buf }); buf = ''; bufType = op.type; }
    buf += op.text;
  }
  if (buf) runs.push({ type: bufType, text: buf });
  return runs;
}

// For a changed line pair, diff at the character level so a single-character
// edit (e.g. a comma to a period) is visible instead of just a full-line
// highlight that reads identical to any other change.
function charDiffLine(leftText, rightText) {
  if (leftText.length * rightText.length > 20_000) return null;
  const ops = diffLines(Array.from(leftText), Array.from(rightText));
  return {
    left: buildInlineRuns(ops, ['context', 'remove']),
    right: buildInlineRuns(ops, ['context', 'add'])
  };
}

function buildSplitRows(ops) {
  const rows = [];
  let leftNo = 0, rightNo = 0, i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.type === 'context') {
      leftNo++; rightNo++;
      rows.push({ type: 'context', leftNo, leftText: op.text, rightNo, rightText: op.text });
      i++;
      continue;
    }
    const removes = [];
    while (i < ops.length && ops[i].type === 'remove') { removes.push(ops[i].text); i++; }
    const adds = [];
    while (i < ops.length && ops[i].type === 'add') { adds.push(ops[i].text); i++; }
    const max = Math.max(removes.length, adds.length);
    for (let k = 0; k < max; k++) {
      const leftText = k < removes.length ? removes[k] : null;
      const rightText = k < adds.length ? adds[k] : null;
      const type = leftText != null && rightText != null ? 'change' : leftText != null ? 'remove' : 'add';
      rows.push({
        type,
        leftNo: leftText != null ? ++leftNo : null,
        leftText,
        rightNo: rightText != null ? ++rightNo : null,
        rightText,
        inline: type === 'change' ? charDiffLine(leftText, rightText) : null
      });
    }
  }
  return rows;
}

function FileDiffTool() {
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [view, setView] = useState('input');
  const [wrap, setWrap] = useState(true);
  const diff = useMemo(() => {
    const a = before.split('\n'), b = after.split('\n');
    if (a.length * b.length > 4_000_000) return { tooLarge: true, ops: [] };
    return { tooLarge: false, ops: diffLines(a, b) };
  }, [before, after]);
  const rows = useMemo(() => diff.tooLarge ? [] : buildSplitRows(diff.ops), [diff]);
  const added = diff.ops.filter(op => op.type === 'add').length;
  const removed = diff.ops.filter(op => op.type === 'remove').length;
  const hasInput = Boolean(before || after);
  const swap = () => { setBefore(after); setAfter(before); };
  const clear = () => { setBefore(''); setAfter(''); };
  return <main className="tool-shell">
    <ToolHeader backHref="/utilities/" backLabel="Utilities" eyebrow="02 / compare text" title="File Diff" />
    <section className="tool-panel"><div className="codec-card diff-card">
      <div className="codec-toolbar">
        <div className="codec-toolbar-left"><div className="mode-switch" role="group" aria-label="View mode"><button className={view==='input'?'active':''} onClick={()=>setView('input')}>input</button><button className={view==='diff'?'active':''} onClick={()=>setView('diff')}>diff</button></div><span className="mono codec-stat">{diff.tooLarge ? 'too large' : `+${added} / -${removed} lines`}</span></div>
        <div className="codec-toolbar-right">{view==='input' && <WrapToggle wrap={wrap} setWrap={setWrap}/>}<button className="btn" onClick={swap} disabled={!hasInput}>swap</button><button className="btn" onClick={clear} disabled={!hasInput}>clear</button><button className="btn primary" onClick={()=>setView(view==='diff'?'input':'diff')} disabled={!hasInput}>{view==='diff'?'edit':'diff'}</button></div>
      </div>
      {view === 'input'
        ? <div className="codec-grid">
            <label><span className="mono">original</span><LineNumberedField value={before} onChange={event=>setBefore(event.target.value)} placeholder="Paste original text…" wrap={wrap} autoFocus/></label>
            <label><span className="mono">changed</span><LineNumberedField value={after} onChange={event=>setAfter(event.target.value)} placeholder="Paste changed text…" wrap={wrap}/></label>
          </div>
        : diff.tooLarge ? <div className="diff-empty">Too large to diff in the browser. Try smaller text.</div>
        : !hasInput ? <div className="diff-empty">Paste text on both sides to see a diff.</div>
        : <div className="diff-split mono">
            <div className="diff-split-head diff-split-head-left">original</div>
            <div className="diff-split-head diff-split-head-right">changed</div>
            {rows.map((row, index) => <React.Fragment key={index}>
              <span className={`diff-gutter diff-gutter-left ${row.type==='remove'||row.type==='change'?'diff-gutter-removed':''}`}>{row.leftNo ?? ''}</span>
              <span className={`diff-cell diff-cell-left ${row.leftText==null?'diff-cell-empty':row.type==='remove'||row.type==='change'?'diff-cell-removed':''}`}>{
                row.inline ? row.inline.left.map((run, i) => run.type==='remove' ? <mark key={i} className="diff-char-removed">{run.text}</mark> : <React.Fragment key={i}>{run.text}</React.Fragment>) : row.leftText
              }</span>
              <span className={`diff-gutter diff-gutter-right ${row.type==='add'||row.type==='change'?'diff-gutter-added':''}`}>{row.rightNo ?? ''}</span>
              <span className={`diff-cell diff-cell-right ${row.rightText==null?'diff-cell-empty':row.type==='add'||row.type==='change'?'diff-cell-added':''}`}>{
                row.inline ? row.inline.right.map((run, i) => run.type==='add' ? <mark key={i} className="diff-char-added">{run.text}</mark> : <React.Fragment key={i}>{run.text}</React.Fragment>) : row.rightText
              }</span>
            </React.Fragment>)}
          </div>}
    </div></section>
  </main>;
}

function jsonValueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function JsonNode({ keyLabel, value, path, collapsed, toggle, trailingComma }) {
  const type = jsonValueType(value);
  if (type === 'object' || type === 'array') {
    const entries = type === 'array' ? value.map((item, index) => [index, item]) : Object.entries(value);
    const isCollapsed = collapsed.has(path);
    const open = type === 'array' ? '[' : '{';
    const close = type === 'array' ? ']' : '}';
    return <div className="json-node">
      <div className="json-row">
        {entries.length > 0
          ? <button className="json-toggle" onClick={() => toggle(path)}>{isCollapsed ? '▸' : '▾'}</button>
          : <span className="json-toggle-spacer" />}
        {keyLabel != null && <><span className="json-key">"{keyLabel}"</span><span className="json-colon">: </span></>}
        <span className="json-punct">{open}</span>
        {isCollapsed && entries.length > 0 && <span className="json-summary" onClick={() => toggle(path)}>{entries.length} {type === 'array' ? 'items' : 'keys'}</span>}
        {(isCollapsed || entries.length === 0) && <><span className="json-punct">{close}</span>{trailingComma && <span className="json-comma">,</span>}</>}
      </div>
      {!isCollapsed && entries.length > 0 && <div className="json-children">
        {entries.map(([key, val], index) => <JsonNode key={key} keyLabel={type === 'object' ? key : null} value={val} path={`${path}.${key}`} collapsed={collapsed} toggle={toggle} trailingComma={index < entries.length - 1} />)}
      </div>}
      {!isCollapsed && entries.length > 0 && <div className="json-row"><span className="json-toggle-spacer" /><span className="json-punct">{close}</span>{trailingComma && <span className="json-comma">,</span>}</div>}
    </div>;
  }
  const display = type === 'string' ? `"${value}"` : String(value);
  return <div className="json-row">
    <span className="json-toggle-spacer" />
    {keyLabel != null && <><span className="json-key">"{keyLabel}"</span><span className="json-colon">: </span></>}
    <span className={`json-${type}`}>{display}</span>{trailingComma && <span className="json-comma">,</span>}
  </div>;
}

function JsonTool() {
  const [source, setSource] = useState('');
  const [indent, setIndent] = useState(2);
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [outputView, setOutputView] = useState('text');
  const [format, setFormat] = useState('beautify');
  const result = useMemo(() => {
    if (!source.trim()) return { value: '', error: '', valid: null, data: undefined };
    try {
      const data = JSON.parse(source);
      return { value: format === 'minify' ? JSON.stringify(data) : JSON.stringify(data, null, indent), error: '', valid: true, data };
    }
    catch (err) { return { value: '', error: err.message, valid: false, data: undefined }; }
  }, [source, indent, format]);
  const toggle = (path) => setCollapsed(current => {
    const next = new Set(current);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });
  const copy = async () => { if (!result.value) return; await navigator.clipboard.writeText(result.value); setCopied(true); window.setTimeout(()=>setCopied(false), 1200); };
  const status = result.valid === null ? 'empty' : result.valid ? 'valid json' : 'invalid json';
  return <main className="tool-shell">
    <ToolHeader backHref="/utilities/" backLabel="Utilities" eyebrow="03 / format + validate" title="JSON Formatter" status={status} />
    <section className="tool-panel"><div className="codec-card">
      <div className="codec-toolbar">
        <div className="codec-toolbar-left"><span className="mono codec-stat">{status}</span></div>
        <div className="codec-toolbar-right"><div className="mode-switch" role="group" aria-label="Output view"><button className={outputView==='text'?'active':''} onClick={()=>setOutputView('text')}>text</button><button className={outputView==='tree'?'active':''} onClick={()=>setOutputView('tree')}>tree</button></div><div className="mode-switch" role="group" aria-label="Output format"><button className={format==='beautify'?'active':''} onClick={()=>setFormat('beautify')}>beautify</button><button className={format==='minify'?'active':''} onClick={()=>setFormat('minify')}>minify</button></div>{format==='beautify' && <div className="mode-switch" role="group" aria-label="Indent size"><button className={indent===2?'active':''} onClick={()=>setIndent(2)}>2</button><button className={indent===4?'active':''} onClick={()=>setIndent(4)}>4</button></div>}<WrapToggle wrap={wrap} setWrap={setWrap}/><button className="btn" onClick={()=>setSource(result.value)} disabled={!result.value} title="Replace the input with this output">← input</button><button className="btn" onClick={()=>setSource('')} disabled={!source}>clear</button><button className="btn primary" onClick={copy} disabled={!result.value}>{copied?'copied':'copy'}</button></div>
      </div>
      <div className="codec-grid">
        <label><span className="mono">json input</span><LineNumberedField value={source} onChange={event=>setSource(event.target.value)} placeholder="Paste JSON…" wrap={wrap} autoFocus/></label>
        <label><span className="mono">formatted output</span>{
          result.valid && outputView === 'tree'
            ? <div className="json-tree mono"><JsonNode value={result.data} keyLabel={null} path="root" collapsed={collapsed} toggle={toggle} trailingComma={false} /></div>
            : <LineNumberedField value={result.error || result.value} readOnly className={result.error?'has-error':''} placeholder="Formatted JSON appears here…" wrap={wrap}/>
        }</label>
      </div>
    </div></section>
  </main>;
}

// Always present, always the first three, in this order.
const PINNED_CODES = ['CNY', 'USD', 'AUD'];
const DEFAULT_CODES = [...PINNED_CODES, 'EUR', 'JPY', 'HKD'];
const FX_CODES_KEY = 'd0u9-fx-codes';
const FX_HISTORY_KEY = 'd0u9-fx-history';
const HISTORY_LIMIT = 40;

// Most currency codes are their ISO 3166 country code plus a unit letter, so
// the flag falls out of the first two letters. These are the ones where that
// rule gives a country that has no flag, or no country at all.
const FLAG_OVERRIDES = { EUR: 'EU', ANG: 'CW', XCG: 'CW', XAF: '', XOF: '', XPF: '', XCD: '' };

function flagFor(code) {
  const country = FLAG_OVERRIDES[code] ?? code.slice(0, 2);
  if (country.length !== 2) return '';
  return String.fromCodePoint(...Array.from(country, char => 0x1f1a5 + char.charCodeAt(0)));
}

function readStoredCodes() {
  try {
    const stored = JSON.parse(localStorage.getItem(FX_CODES_KEY));
    const clean = Array.isArray(stored) ? stored.filter(code => ISO_CODES.includes(code)) : [];
    return clean.length ? withPinned(clean) : DEFAULT_CODES;
  } catch { return DEFAULT_CODES; }
}

// A stored list from an older build, or one edited by hand, can be missing a
// pinned code or have it out of position.
function withPinned(codes) {
  return [...PINNED_CODES, ...Array.from(new Set(codes)).filter(code => !PINNED_CODES.includes(code))];
}

function readStoredHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(FX_HISTORY_KEY));
    return Array.isArray(stored) ? stored.filter(entry => entry && entry.base && Array.isArray(entry.legs)) : [];
  } catch { return []; }
}

function sanitizeAmount(raw) {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('')}` : head;
}

// Small amounts need more decimals to stay meaningful (0.0091 USD), large ones
// read better with fewer (12,406.71 JPY).
function formatAmount(value) {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  const digits = magnitude >= 1000 ? 2 : magnitude >= 1 ? 4 : 6;
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

// The amount fields are right-aligned single lines, so a long number would
// otherwise run out of the card and off the screen. Shrinking by character
// count is enough here: the font is monospaced, so width is proportional to
// length. Ten characters is what the widest card fits at full size.
const FIT_CHARS = 10;
const MIN_FIT_SCALE = 0.42;

function fitScale(text) {
  const length = String(text || '').length;
  if (length <= FIT_CHARS) return 1;
  return Math.max(MIN_FIT_SCALE, FIT_CHARS / length);
}

function fitStyle(text) {
  return { fontSize: `calc(var(--fx-num-size) * ${fitScale(text).toFixed(3)})` };
}

// An inline SVG rather than a chart library: one line and two axes do not
// justify the bundle, and the viewBox scales to whatever width the card has.
const CHART_W = 720, CHART_H = 180, CHART_PAD = { top: 16, right: 16, bottom: 16, left: 36 };

function RateChart({ series, from, to }) {
  const [hover, setHover] = useState(null);
  const plotRef = useRef(null);

  const { path, area, first, last, lastValue, change, coords, mid, ticks } = useMemo(() => {
    const values = series.points.map(point => point.value);
    const low = Math.min(...values), high = Math.max(...values);
    // A flat series would divide by zero; give it a band so the line sits mid-height.
    const span = high - low || Math.abs(high) || 1;
    const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
    const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
    const x = (index) => CHART_PAD.left + (series.points.length === 1 ? innerW / 2 : (index / (series.points.length - 1)) * innerW);
    const y = (value) => CHART_PAD.top + innerH - ((value - low) / span) * innerH;
    const path = series.points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`).join(' ');
    const area = `${path} L${x(series.points.length - 1).toFixed(2)} ${CHART_PAD.top + innerH} L${x(0).toFixed(2)} ${CHART_PAD.top + innerH} Z`;
    const firstValue = series.points[0].value, lastValue = series.points[series.points.length - 1].value;
    // The svg is stretched with preserveAspectRatio="none", so a viewBox
    // coordinate maps to a plain percentage of the box in both axes. The
    // crosshair is drawn in HTML on top of it and lands on the same pixel.
    const coords = series.points.map((point, index) => ({
      ...point,
      left: (x(index) / CHART_W) * 100,
      top: (y(point.value) / CHART_H) * 100
    }));
    const mid = CHART_PAD.top + innerH / 2;
    // The value axis is drawn in HTML beside the plot, for the same reason the
    // crosshair is: preserveAspectRatio="none" would stretch SVG text.
    const ticks = [
      { value: high, top: (CHART_PAD.top / CHART_H) * 100 },
      { value: (high + low) / 2, top: (mid / CHART_H) * 100 },
      { value: low, top: ((CHART_H - CHART_PAD.bottom) / CHART_H) * 100 }
    ];
    return {
      path, area, coords, mid, ticks,
      first: series.points[0].date,
      last: series.points[series.points.length - 1].date,
      lastValue,
      change: firstValue ? ((lastValue - firstValue) / firstValue) * 100 : 0
    };
  }, [series]);

  const track = (event) => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    const ratio = ((event.clientX - box.left) / box.width) * CHART_W;
    const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
    const position = ((ratio - CHART_PAD.left) / innerW) * (coords.length - 1);
    setHover(Math.max(0, Math.min(coords.length - 1, Math.round(position))));
  };

  const point = hover === null ? null : coords[hover];

  return <div className="fx-chart-figure">
    <div className="fx-chart-readout mono">
      <span className="fx-chart-value">1 {from} = {formatAmount(lastValue)} {to}</span>
      <span className={`fx-chart-change ${change >= 0 ? 'up' : 'down'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}% over {series.points.length} readings</span>
    </div>
    <div
      className="fx-chart-plot"
      ref={plotRef}
      onPointerMove={track}
      onPointerDown={track}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
    >
      <svg className="fx-chart-svg" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" role="img" aria-label={`${from} to ${to} rate history`}>
        <defs>
          <linearGradient id="fx-chart-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".26" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className="fx-chart-grid" x1={CHART_PAD.left} x2={CHART_W - CHART_PAD.right} y1={CHART_PAD.top} y2={CHART_PAD.top} />
        <line className="fx-chart-grid faint" x1={CHART_PAD.left} x2={CHART_W - CHART_PAD.right} y1={mid} y2={mid} />
        <line className="fx-chart-grid" x1={CHART_PAD.left} x2={CHART_W - CHART_PAD.right} y1={CHART_H - CHART_PAD.bottom} y2={CHART_H - CHART_PAD.bottom} />
        <path className="fx-chart-area" d={area} />
        <path className="fx-chart-line" d={path} />
      </svg>
      <div className="fx-chart-ticks mono" aria-hidden="true" style={{ width: `${(CHART_PAD.left / CHART_W) * 100}%` }}>
        {ticks.map(tick => <span key={tick.top} className="fx-chart-tick" style={{ top: `${tick.top}%` }}>{formatAmount(tick.value)}</span>)}
      </div>
      {!point && <span className="fx-chart-dot last" aria-hidden="true" style={{ left: `${coords[coords.length - 1].left}%`, top: `${coords[coords.length - 1].top}%` }} />}
      {point && <div className="fx-chart-cursor" aria-hidden="true">
        <span className="fx-chart-crosshair vertical" style={{ left: `${point.left}%` }} />
        <span className="fx-chart-crosshair horizontal" style={{ top: `${point.top}%` }} />
        <span className="fx-chart-dot" style={{ left: `${point.left}%`, top: `${point.top}%` }} />
      </div>}
      {point && <div
        className={`fx-chart-tip mono ${point.left > 62 ? 'flip' : ''}`}
        style={{ left: `${point.left}%`, top: `${point.top}%` }}
        role="status"
      >
        <span className="fx-chart-tip-date">{point.date}</span>
        <span className="fx-chart-tip-rate">1 {from} = {formatAmount(point.value)} {to}</span>
      </div>}
    </div>
    <div className="fx-chart-axis mono" style={{ paddingLeft: `${(CHART_PAD.left / CHART_W) * 100}%` }}>
      <span>{first}</span>
      <span>{last}</span>
    </div>
  </div>;
}

function CurrencyTool() {
  const [codes, setCodes] = useState(readStoredCodes);
  const [base, setBase] = useState(() => readStoredCodes()[0]);
  const [amount, setAmount] = useState('1');
  const [sourceId, setSourceId] = useState(readStoredSourceId);
  const [rates, setRates] = useState(() => cachedRates(readStoredSourceId()));
  const [names, setNames] = useState(() => (cachedNames()?.names) || FALLBACK_NAMES);
  const [history, setHistory] = useState(readStoredHistory);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [choosingSource, setChoosingSource] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // The two currencies the chart compares. Picking a third drops the oldest,
  // so the pair is always the last two the user asked for.
  const [pair, setPair] = useState([]);
  const [range, setRange] = useState(SERIES_RANGES[0].id);
  const [series, setSeries] = useState(null);
  const [seriesError, setSeriesError] = useState('');
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [dragCode, setDragCode] = useState(null);
  const listRef = useRef(null);

  useEffect(() => { try { localStorage.setItem(FX_CODES_KEY, JSON.stringify(codes)); } catch {} }, [codes]);
  useEffect(() => { try { localStorage.setItem(FX_HISTORY_KEY, JSON.stringify(history)); } catch {} }, [history]);

  const load = useCallback(async (id) => {
    setLoading(true);
    try { setRates(await fetchRates(id)); setError(''); }
    catch (err) { setError(err.message || 'Could not reach the rate source.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Cached rates render instantly; a stale cache still refreshes in the
    // background so the visible numbers are never older than the TTL.
    const cached = cachedRates(sourceId);
    setRates(cached);
    setError('');
    if (!cached || isStale(cached)) load(sourceId);
  }, [sourceId, load]);

  useEffect(() => {
    const storedNames = cachedNames();
    if (!storedNames || isStale(storedNames)) {
      fetchNames().then(entry => { if (entry) setNames(entry.names); });
    }
  }, []);

  const pickSource = (id) => {
    storeSourceId(id);
    setSourceId(id);
    setChoosingSource(false);
  };

  const table = rates?.rates;
  const convert = useCallback((code) => {
    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || !table || !table[base] || !table[code]) return '';
    return formatAmount(value * (table[code] / table[base]));
  }, [amount, base, table]);

  // History is written only when asked for. Recording every keystroke, or even
  // every pause in typing, filled the list with amounts nobody meant to keep.
  // The entry leads with the currency the amount was typed in, which is what
  // makes it readable later: 1 USD = 7.1 CNY = 1.5 AUD.
  const saveable = Boolean(amount) && Number.isFinite(Number(amount)) && Number(amount) !== 0 && Boolean(table && table[base]);
  const save = () => {
    const value = Number(amount);
    if (!saveable) return;
    const legs = codes
      .filter(code => code !== base && table[code])
      .map(code => ({ code, value: formatAmount(value * (table[code] / table[base])) }));
    if (!legs.length) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      base,
      amount: formatAmount(value),
      legs,
      source: rates?.source || '',
      date: rates?.date || ''
    };
    setHistory(current => [entry, ...current].slice(0, HISTORY_LIMIT));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const togglePair = (code) => setPair(current => {
    if (current.includes(code)) return current.filter(item => item !== code);
    return [...current, code].slice(-2);
  });

  const rangeDays = SERIES_RANGES.find(option => option.id === range)?.days || 30;
  useEffect(() => {
    if (pair.length !== 2) { setSeries(null); setSeriesError(''); return; }
    let cancelled = false;
    setSeriesLoading(true);
    setSeriesError('');
    fetchSeries(pair[0], pair[1], rangeDays)
      .then(entry => { if (!cancelled) { setSeries(entry); setSeriesError(''); } })
      .catch(err => { if (!cancelled) { setSeries(null); setSeriesError(err.message || 'No history for this pair.'); } })
      .finally(() => { if (!cancelled) setSeriesLoading(false); });
    return () => { cancelled = true; };
  }, [pair, rangeDays]);

  const edit = (code, raw) => { setBase(code); setAmount(sanitizeAmount(raw)); };
  const remove = (code) => {
    setPair(current => current.filter(item => item !== code));
    setCodes(current => {
      if (PINNED_CODES.includes(code)) return current;
      const next = current.filter(item => item !== code);
      if (code === base) setBase(next[0]);
      return next;
    });
  };
  const forget = (id) => setHistory(current => current.filter(entry => entry.id !== id));
  const replay = (entry) => { setBase(entry.base); setAmount(sanitizeAmount(entry.amount)); };

  // Pointer events rather than HTML5 drag-and-drop: the cards must reorder by
  // touch too, and dragstart/dragover never fire on touch screens.
  const startDrag = (code, event) => {
    if (PINNED_CODES.includes(code)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragCode(code);
  };
  const moveDrag = (event) => {
    if (!dragCode || !listRef.current) return;
    const cards = Array.from(listRef.current.querySelectorAll('[data-code]'));
    const hovered = cards.find(card => {
      const box = card.getBoundingClientRect();
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    });
    const target = hovered?.dataset.code;
    // Pinned cards are not a valid drop target: they keep their slots.
    if (!target || target === dragCode || PINNED_CODES.includes(target)) return;
    setCodes(current => {
      const from = current.indexOf(dragCode), to = current.indexOf(target);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };
  const endDrag = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragCode(null);
  };

  const available = useMemo(() => {
    if (!table) return [];
    const needle = query.trim().toUpperCase();
    return ISO_CODES
      .filter(code => table[code] && !codes.includes(code))
      .filter(code => !needle || code.includes(needle) || (names[code] || '').toUpperCase().includes(needle))
      .slice(0, 60);
  }, [table, codes, names, query]);

  const copy = async () => {
    if (!table) return;
    const lines = codes.map(code => `${code} ${convert(code)}`).join('\n');
    await navigator.clipboard.writeText(lines);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const active = sourceById(sourceId);
  const status = error ? 'rates offline' : rates ? `rates ${rates.date}` : 'loading rates';
  const stat = error
    ? error
    : rates
      ? `${rates.source} · ${rates.date}${isStale(rates) ? ' · cached' : ''}`
      : `fetching ${active.label}…`;

  return <main className="tool-shell fx-shell">
    <ToolHeader backHref="/utilities/" backLabel="Utilities" eyebrow="04 / live conversion" title="Currency" status={status} />
    <section className="tool-panel"><div className="codec-card">
      <div className="codec-toolbar">
        <div className="codec-toolbar-left"><span className={`mono codec-stat ${error ? 'has-error' : ''}`}>{stat}</span></div>
        <div className="codec-toolbar-right">
          <button className={`btn ${choosingSource ? 'active' : ''}`} onClick={() => { setChoosingSource(open => !open); setPicking(false); }} title={`Rates from ${active.label}`}>source: {active.label}</button>
          <button className={`btn ${picking ? 'active' : ''}`} onClick={() => { setPicking(open => !open); setChoosingSource(false); setQuery(''); }} disabled={!table}>add</button>
          <button className="btn" onClick={() => load(sourceId)} disabled={loading}>{loading ? 'loading' : 'refresh'}</button>
          <button className="btn" onClick={() => setAmount('')} disabled={!amount}>clear</button>
          <button className="btn" onClick={save} disabled={!saveable}>{saved ? 'saved' : 'save'}</button>
          <button className="btn primary" onClick={copy} disabled={!table || !amount}>{copied ? 'copied' : 'copy'}</button>
        </div>
      </div>
      {choosingSource && <div className="fx-sources">
        {SOURCES.map(option => {
          const cached = cachedRates(option.id);
          return <button
            className={`fx-source ${option.id === sourceId ? 'active' : ''}`}
            key={option.id}
            onClick={() => pickSource(option.id)}
          >
            <span className="fx-source-head">
              <span className="mono fx-source-label">{option.label}</span>
              {option.id === sourceId && <span className="mono fx-source-tag">in use</span>}
              {option.id === DEFAULT_SOURCE_ID && option.id !== sourceId && <span className="mono fx-source-tag">default</span>}
            </span>
            <span className="fx-source-note">{option.description}</span>
            <span className="mono fx-source-when">{cached ? `${cached.date || 'no date'} · fetched ${new Date(cached.fetchedAt).toLocaleString()}` : 'not fetched yet'}</span>
          </button>;
        })}
      </div>}
      <div className="fx-body">
        <div className="fx-main">
          <div className="fx-grid" ref={listRef}>
            {codes.map(code => <article
              className={`fx-card ${code === base ? 'active' : ''} ${code === dragCode ? 'dragging' : ''} ${PINNED_CODES.includes(code) ? 'pinned' : ''} ${pair.includes(code) ? 'picked' : ''}`}
              data-code={code}
              key={code}
            >
              <div className="fx-card-top">
                <button
                  className={`fx-identity ${pair.includes(code) ? 'active' : ''}`}
                  onClick={() => togglePair(code)}
                  aria-pressed={pair.includes(code)}
                  title={`${names[code] || code} — ${pair.includes(code) ? 'remove from the chart' : 'chart against another currency'}`}
                >
                  <span className="fx-flag" aria-hidden="true">{flagFor(code)}</span>
                  <span className="fx-id">
                    <span className="fx-code mono">{code}</span>
                    <span className="fx-name">{names[code] || code}</span>
                  </span>
                  {pair.includes(code) && <span className="fx-pick-badge mono" aria-hidden="true">{pair.indexOf(code) + 1}</span>}
                </button>
                <div className="fx-card-tools">
                  {PINNED_CODES.includes(code)
                    ? <span className="fx-pin" title="Pinned" aria-label={`${code} is pinned`}>★</span>
                    : <button
                        className="fx-handle"
                        onPointerDown={event => startDrag(code, event)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        aria-label={`Reorder ${code}`}
                        title="Drag to reorder"
                      >⠿</button>}
                  {!PINNED_CODES.includes(code) && <button className="fx-remove" onClick={() => remove(code)} aria-label={`Remove ${code}`}>×</button>}
                </div>
              </div>
              <input
                className="fx-input mono"
                inputMode="decimal"
                value={code === base ? amount : convert(code)}
                style={fitStyle(code === base ? amount : convert(code))}
                onChange={event => edit(code, event.target.value)}
                onFocus={event => event.target.select()}
                placeholder="0"
                aria-label={`Amount in ${code}`}
                disabled={!table}
              />
              <div className="fx-card-foot mono">
                {code === base ? 'base currency' : table && table[code] && table[base] ? `1 ${base} = ${formatAmount(table[code] / table[base])}` : '—'}
              </div>
            </article>)}
          </div>
          {Boolean(pair.length) && <div className="fx-chart">
            <div className="fx-chart-head">
              <span className="mono fx-chart-title">
                {pair.length === 2 ? `${pair[0]} / ${pair[1]} · ${SERIES_SOURCE_LABEL}` : `${pair[0]} · tap another currency name to compare`}
              </span>
              <div className="fx-chart-controls">
                {pair.length === 2 && <button className="btn" onClick={() => setPair([pair[1], pair[0]])} title="Swap which way round the pair is quoted">swap</button>}
                {pair.length === 2 && <div className="mode-switch" role="group" aria-label="Chart range">
                  {SERIES_RANGES.map(option => <button className={range === option.id ? 'active' : ''} key={option.id} onClick={() => setRange(option.id)}>{option.label}</button>)}
                </div>}
                <button className="btn" onClick={() => setPair([])}>close</button>
              </div>
            </div>
            {pair.length === 2 && (
              seriesError ? <div className="fx-empty mono has-error">{seriesError}</div>
                : seriesLoading && !series ? <div className="fx-empty mono">loading history…</div>
                  : series ? <RateChart series={series} from={pair[0]} to={pair[1]} />
                    : null
            )}
          </div>}
          <div className="fx-history">
            <div className="fx-history-head">
              <span className="mono fx-history-title">history{history.length ? ` · ${history.length}` : ''}</span>
              <div className="fx-history-actions">
                {history.length > 1 && <button className="btn" onClick={() => setExpanded(open => !open)}>{expanded ? 'collapse' : `show all · ${history.length}`}</button>}
                <button className="btn" onClick={() => { setHistory([]); setExpanded(false); }} disabled={!history.length}>clear all</button>
              </div>
            </div>
            {history.length
              ? <ul className={`fx-history-list ${expanded ? 'expanded' : ''}`}>
                  {(expanded ? history : history.slice(0, 1)).map(entry => <li className="fx-history-row" key={entry.id}>
                    <button className="fx-history-line" onClick={() => replay(entry)} title="Put this amount back in the converter">
                      <span className="fx-history-leg base">
                        <span className="fx-history-flag" aria-hidden="true">{flagFor(entry.base)}</span>
                        <span className="mono">{entry.amount} {entry.base}</span>
                      </span>
                      {entry.legs.map(leg => <span className="fx-history-leg" key={leg.code}>
                        <span className="fx-history-eq" aria-hidden="true">=</span>
                        <span className="fx-history-flag" aria-hidden="true">{flagFor(leg.code)}</span>
                        <span className="mono">{leg.value} {leg.code}</span>
                      </span>)}
                    </button>
                    <span className="fx-history-meta mono">
                      {entry.source && <span className="fx-history-source" title={entry.date ? `Rates dated ${entry.date}` : 'Rate source'}>{entry.source}{entry.date ? ` · ${entry.date}` : ''}</span>}
                      <span className="fx-history-when">{new Date(entry.at).toLocaleTimeString()}</span>
                    </span>
                    <button className="fx-history-remove" onClick={() => forget(entry.id)} aria-label="Delete this entry">×</button>
                  </li>)}
                </ul>
              : <div className="fx-empty mono">nothing saved yet — press save to keep a conversion</div>}
          </div>
        </div>
        {picking && <aside className="fx-picker">
          <input className="fx-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code or name…" aria-label="Search currencies" autoFocus />
          <div className="fx-options">
            {available.map(code => <button className="fx-option" key={code} onClick={() => { setCodes(current => [...current, code]); setQuery(''); }}>
              <span className="fx-option-flag" aria-hidden="true">{flagFor(code)}</span>
              <span className="mono">{code}</span>
              <span className="fx-option-name">{names[code] || ''}</span>
            </button>)}
            {!available.length && <div className="fx-empty mono">no match</div>}
          </div>
        </aside>}
      </div>
    </div></section>
  </main>;
}


function App(){
  const path = location.pathname;
  if (path.includes('/base64')) return <Base64Tool/>;
  if (path.includes('/filediff')) return <FileDiffTool/>;
  if (path.includes('/jsonformat')) return <JsonTool/>;
  if (path.includes('/currency')) return <CurrencyTool/>;
  return <UtilitiesHub/>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><AmbientCursor><div className="site-shell"><div className="grid-noise"/><App/></div></AmbientCursor></React.StrictMode>);
