import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientCursor from './components/AmbientCursor.jsx';
import { CollectionCard, CollectionHero, LineNumberedField, PageHeader, ToolHeader } from './components/PageChrome.jsx';
import './styles.css';

const TOOLS = [
  { title: 'Base64', eyebrow: '01 / encode + decode', description: 'Convert text and Base64 locally, with full Unicode support.', href: '/utilities/base64/', glyph: 'Aa' },
  { title: 'File Diff', eyebrow: '02 / compare text', description: 'Compare two blocks of text and see line-by-line changes.', href: '/utilities/filediff/', glyph: '≠' },
  { title: 'JSON Formatter', eyebrow: '03 / format + validate', description: 'Pretty-print, minify, and validate JSON locally.', href: '/utilities/jsonformat/', glyph: '{}' },
];

function UtilitiesHub() {
  return <main className="section-shell utility-shell">
    <PageHeader section="utilities" />
    <CollectionHero eyebrow="browser utilities" title="Useful things." mutedTitle="Nothing leaves." description="Small tools that work entirely on this device. Your input is never uploaded or stored." />
    <section className="collection-grid">{TOOLS.map(tool=><CollectionCard className="utility-card" eyebrow={tool.eyebrow} glyph={tool.glyph} title={tool.title} description={tool.description} meta="RUNS LOCALLY" href={tool.href} key={tool.href} />)}</section>
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

function App(){
  const path = location.pathname;
  if (path.includes('/base64')) return <Base64Tool/>;
  if (path.includes('/filediff')) return <FileDiffTool/>;
  if (path.includes('/jsonformat')) return <JsonTool/>;
  return <UtilitiesHub/>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><AmbientCursor><div className="site-shell"><div className="grid-noise"/><App/></div></AmbientCursor></React.StrictMode>);
