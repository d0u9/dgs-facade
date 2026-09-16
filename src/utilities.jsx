import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientCursor from './components/AmbientCursor.jsx';
import { CollectionCard, CollectionHero, DetailIntro, PageHeader } from './components/PageChrome.jsx';
import './styles.css';

const TOOLS = [
  { title: 'Base64', eyebrow: '01 / encode + decode', description: 'Convert text and Base64 locally, with full Unicode support.', href: '/utilities/base64/', glyph: 'Aa' },
];

function UtilitiesHub() {
  return <main className="section-shell utility-shell">
    <PageHeader section="utilities" />
    <CollectionHero eyebrow="browser utilities" title="Useful things." mutedTitle="Nothing leaves." description="Small tools that work entirely on this device. Your input is never uploaded or stored." />
    <section className="collection-grid">{TOOLS.map(tool=><CollectionCard className="utility-card" eyebrow={tool.eyebrow} glyph={tool.glyph} title={tool.title} description={tool.description} meta="RUNS LOCALLY" href={tool.href} key={tool.href} />)}</section>
    <footer className="footer"><span>processed on this device</span><a href="/">back home</a></footer>
  </main>;
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
  return <main className="detail-shell">
    <PageHeader section="utilities" page="base64" />
    <DetailIntro backHref="/utilities/" backLabel="Utilities" eyebrow="01 / encode + decode" title="Base64" description="Unicode-safe conversion in your browser. Input is never sent anywhere." />
    <section className="workspace-stage"><div className="codec-card">
      <div className="codec-toolbar"><div className="mode-switch" role="group" aria-label="Conversion mode"><button className={mode==='encode'?'active':''} onClick={()=>setMode('encode')}>encode</button><button className={mode==='decode'?'active':''} onClick={()=>setMode('decode')}>decode</button></div><button className="btn" onClick={swap} disabled={!result.value}>swap sides</button></div>
      <div className="codec-grid"><label><span className="mono">{mode === 'encode' ? 'plain text' : 'base64 input'}</span><textarea value={source} onChange={event=>setSource(event.target.value)} placeholder={mode==='encode'?'Type or paste text…':'Paste Base64…'} spellCheck="false" autoFocus/></label><label><span className="mono">{mode === 'encode' ? 'base64 output' : 'decoded text'}</span><textarea value={result.error || result.value} readOnly className={result.error?'has-error':''} placeholder="Result appears here…" spellCheck="false"/></label></div>
      <div className="codec-footer"><span className="mono">{source.length.toLocaleString()} chars · {result.value.length.toLocaleString()} output</span><div><button className="btn" onClick={()=>setSource('')} disabled={!source}>clear</button><button className="btn primary" onClick={copy} disabled={!result.value}>{copied?'copied':'copy result'}</button></div></div>
    </div></section>
  </main>;
}

function App(){return location.pathname.includes('/base64')?<Base64Tool/>:<UtilitiesHub/>}
createRoot(document.getElementById('root')).render(<React.StrictMode><AmbientCursor><div className="site-shell"><div className="grid-noise"/><App/></div></AmbientCursor></React.StrictMode>);
