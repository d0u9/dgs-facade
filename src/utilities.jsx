import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientCursor from './components/AmbientCursor.jsx';
import { CollectionCard, CollectionHero, LineNumberedField, PageHeader, ToolHeader } from './components/PageChrome.jsx';
import { DEFAULT_SOURCE_ID, FALLBACK_NAMES, ISO_CODES, SOURCES, cachedNames, cachedRates, fetchNames, fetchRates, isStale, readStoredSourceId, sourceById, storeSourceId } from './fx.js';
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

  // A history entry is written once the typing stops, not per keystroke, so
  // "1", "12", "123" leave one row rather than three. The entry always leads
  // with the currency the amount was typed in, which is what makes it
  // readable later: 1 USD = 7.1 CNY = 1.5 AUD.
  useEffect(() => {
    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value === 0 || !table || !table[base]) return;
    const timer = window.setTimeout(() => {
      const legs = codes
        .filter(code => code !== base && table[code])
        .map(code => ({ code, value: formatAmount(value * (table[code] / table[base])) }));
      if (!legs.length) return;
      setHistory(current => {
        const signature = `${sourceId}|${base}|${amount}|${legs.map(leg => leg.code).join(',')}`;
        if (current[0] && current[0].signature === signature) return current;
        const entry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          signature,
          at: Date.now(),
          base,
          amount: formatAmount(value),
          legs,
          source: rates?.source || '',
          date: rates?.date || ''
        };
        return [entry, ...current].slice(0, HISTORY_LIMIT);
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [amount, base, codes, table, rates, sourceId]);

  const edit = (code, raw) => { setBase(code); setAmount(sanitizeAmount(raw)); };
  const remove = (code) => setCodes(current => {
    if (PINNED_CODES.includes(code)) return current;
    const next = current.filter(item => item !== code);
    if (code === base) setBase(next[0]);
    return next;
  });
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
              className={`fx-card ${code === base ? 'active' : ''} ${code === dragCode ? 'dragging' : ''} ${PINNED_CODES.includes(code) ? 'pinned' : ''}`}
              data-code={code}
              key={code}
            >
              <div className="fx-card-top">
                <span className="fx-flag" aria-hidden="true">{flagFor(code)}</span>
                <div className="fx-id">
                  <span className="fx-code mono">{code}</span>
                  <span className="fx-name">{names[code] || code}</span>
                </div>
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
                {code === base ? 'base currency' : table && table[code] && table[base] ? `1 ${base} = ${formatAmount(table[code] / table[base])} ${code}` : '—'}
              </div>
            </article>)}
          </div>
          <div className="fx-history">
            <div className="fx-history-head">
              <span className="mono fx-history-title">history{history.length ? ` · ${history.length}` : ''}</span>
              <button className="btn" onClick={() => setHistory([])} disabled={!history.length}>clear all</button>
            </div>
            {history.length
              ? <ul className="fx-history-list">
                  {history.map(entry => <li className="fx-history-row" key={entry.id}>
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
              : <div className="fx-empty mono">nothing converted yet</div>}
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
