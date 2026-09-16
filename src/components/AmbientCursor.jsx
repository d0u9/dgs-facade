import GlowCursor from './GlowCursor.jsx';

export default function AmbientCursor({ children }) {
  return (
    <div className="glow-stage">
      <GlowCursor
        color="#67E8F9"
        secondaryColor="#A78BFA"
        trailLength={26}
        trailWidth={5}
        trailTaper={0.9}
        followSpeed={0.18}
        glowIntensity={1.15}
        glowSpread={0.75}
        hotspot={0.35}
        brightness={0.8}
        opacity={0.48}
        pulseSpeed={0.65}
        noiseStrength={0.012}
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
