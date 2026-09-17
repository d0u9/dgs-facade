import GlowCursor from './GlowCursor.jsx';

export default function AmbientCursor({ children }) {
  return (
    <div className="glow-stage">
      <GlowCursor
        color="#67E8F9"
        secondaryColor="#A78BFA"
        trailLength={38}
        trailWidth={8}
        trailTaper={0.96}
        followSpeed={0.17}
        glowIntensity={1.7}
        glowSpread={1}
        hotspot={0.58}
        brightness={1.08}
        opacity={0.7}
        pulseSpeed={0.85}
        noiseStrength={0.016}
        idleFade
        idleTimeout={480}
        fadeDuration={650}
        blendMode="screen"
        maxDevicePixelRatio={1.25}
        style={{ minHeight: '100vh', height: 'auto' }}
      >
        {children}
      </GlowCursor>
    </div>
  );
}
