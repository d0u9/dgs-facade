import React from 'react';
import { createRoot } from 'react-dom/client';
import AmbientCursor from './components/AmbientCursor.jsx';
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
  const cards = [
    {
      eyebrow: '01 / arcade',
      title: 'Arcade',
      description: 'Browser-native classics, collected in one quiet arcade.',
      href: '/arcade/',
    },
    {
      eyebrow: '02 / utilities',
      title: 'Utilities',
      description: 'Small, private tools that run entirely in your browser.',
      href: '/utilities/',
    },
    {
      eyebrow: '03 / tracks',
      title: 'Tracks',
      description: 'Flights, drives, hikes, and voyages on a 3D map.',
      href: '/tracks/',
    },
  ];

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
            {cards.map((card) => (
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
    <AmbientCursor>
      <HomeContent />
    </AmbientCursor>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
