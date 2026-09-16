import React from 'react';
import { createRoot } from 'react-dom/client';
import GlowCursor from './components/GlowCursor.jsx';
import config from './config.json';
import './styles.css';

function LaunchCard({ eyebrow, title, description, href, external = false }) {
  return (
    <a
      className="launch-card"
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <div className="card-top">
        <span>{eyebrow}</span>
        <span className="card-arrow">↗</span>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </a>
  );
}

function HomeContent() {
  return (
    <div className="site-shell">
      <div className="grid-noise" aria-hidden="true" />

      <main className="home">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark" />
            <span>{config.site.name} / home</span>
          </a>

          <div className="status mono">
            <span className="status-dot" />
            <span>{config.home.status}</span>
          </div>
        </header>

        <section className="hero">
          <div>
            <div className="eyebrow">{config.home.eyebrow}</div>

            <h1>
              {config.home.headline}
              <br />
              <span className="dim">{config.home.headlineMuted}</span>
            </h1>

            <p className="hero-copy">
              {config.home.description}
            </p>

            <div className="meta-row">
              {config.home.pills.map((pill) => (
                <span className="pill" key={pill}>{pill}</span>
              ))}
            </div>
          </div>

          <div className="launch-grid">
            {config.home.cards.map((card) => (
              <LaunchCard key={card.href} {...card} />
            ))}
          </div>
        </section>

        <footer className="footer">
          <span>{config.home.footerLeft}</span>
          <span>{config.home.footerRight}</span>
        </footer>
      </main>
    </div>
  );
}

function Home() {
  return (
    <div
      className="glow-stage"
      style={{ position: 'relative', width: '100%', minHeight: '100vh', background: '#050610' }}
    >
      <GlowCursor
        color="#67E8F9"
        secondaryColor="#A78BFA"
        trailLength={40}
        trailWidth={8}
        trailTaper={0.8}
        followSpeed={0.16}
        glowIntensity={1.9}
        glowSpread={1.2}
        hotspot={0.65}
        brightness={1.25}
        opacity={1}
        pulseSpeed={1.1}
        noiseStrength={0.035}
        idleFade
        idleTimeout={700}
        fadeDuration={900}
        blendMode="screen"
        style={{ minHeight: '100vh', height: 'auto' }}
      >
        <HomeContent />
      </GlowCursor>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
