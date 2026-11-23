import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AnimatedLamp3DProps {
  isLightOn: boolean;
  onToggle: (newState: boolean) => void;
  soundEnabled?: boolean;
  className?: string;
}

// Web Audio API Synthesizer for high-fidelity mechanical click-clack switch sound
class LampAudio {
  private static ctx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  static playSwitchSound(isTurningOn: boolean) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // 1. Sharp latch snap (high click)
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(isTurningOn ? 2400 : 1850, now);
      clickOsc.frequency.exponentialRampToValueAtTime(320, now + 0.032);

      clickGain.gain.setValueAtTime(0.4, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

      clickOsc.connect(clickGain);
      clickGain.connect(ctx.destination);

      clickOsc.start(now);
      clickOsc.stop(now + 0.045);

      // 2. Metallic brass housing resonance (clack)
      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(isTurningOn ? 650 : 540, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(120, now + 0.065);

      bodyGain.gain.setValueAtTime(0.25, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      bodyOsc.connect(bodyGain);
      bodyGain.connect(ctx.destination);

      bodyOsc.start(now);
      bodyOsc.stop(now + 0.08);

      // 3. Chain bead friction sound
      const rattleOsc = ctx.createOscillator();
      const rattleGain = ctx.createGain();
      rattleOsc.type = 'square';
      rattleOsc.frequency.setValueAtTime(3600, now + 0.01);
      rattleOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);

      rattleGain.gain.setValueAtTime(0.06, now + 0.01);
      rattleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      rattleOsc.connect(rattleGain);
      rattleGain.connect(ctx.destination);

      rattleOsc.start(now + 0.01);
      rattleOsc.stop(now + 0.05);
    } catch {
      // Audio context guard
    }
  }
}

export function AnimatedLamp3D({
  isLightOn,
  onToggle,
  soundEnabled = true,
  className = ''
}: AnimatedLamp3DProps) {
  const [pullOffset, setPullOffset] = useState({ x: 0, y: 0 });
  const [lampTilt, setLampTilt] = useState(0);
  // Motion only enhances the hanging lamp. Authentication never depends on a sensor.
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionSupported, setMotionSupported] = useState(false);
  const [motionError, setMotionError] = useState('');
  const [deviceTilt, setDeviceTilt] = useState(0);
  const motionTargetRef = useRef(0);

  const [isDragging, setIsDragging] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const currentPosRef = useRef({ x: 0, y: 0 });
  const pullRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  // Pointer-up already performs the pull action; suppress the synthetic click that follows it.
  const suppressClickRef = useRef(false);

  const PULL_MAX_Y = 85;
  const PULL_MAX_X = 60;
  const PULL_THRESHOLD = 28;

  const triggerSwitch = useCallback((targetState: boolean) => {
    if (soundEnabled) {
      LampAudio.playSwitchSound(targetState);
    }
    // Vibration removed per user specification
    onToggle(targetState);
  }, [soundEnabled, onToggle]);

  // Spring physics return animation with high-fidelity tactile bounce
  const animateSpringReturn = useCallback((fromX: number, fromY: number, shouldToggle: boolean) => {
    setIsBouncing(true);
    if (shouldToggle) {
      triggerSwitch(!isLightOn);
    }

    const start = performance.now();
    const duration = 640;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);

      const decay = Math.exp(-progress * 4.4);
      const oscillation = Math.cos(progress * Math.PI * 5.2);

      const curY = fromY * decay * oscillation;
      const curX = fromX * decay * oscillation;

      const shadeRecoil = -(curX * 0.035) * Math.exp(-progress * 6.5);
      setLampTilt(shadeRecoil);

      setPullOffset({
        x: Math.abs(curX) < 0.25 ? 0 : curX,
        y: Math.abs(curY) < 0.25 ? 0 : curY
      });

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setPullOffset({ x: 0, y: 0 });
        setLampTilt(0);
        setIsBouncing(false);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [isLightOn, triggerSwitch]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);


  // iOS requires a user gesture before requesting DeviceOrientation permission.
  // Unsupported/denied sensors leave the cord and click controls fully functional.
  useEffect(() => {
    setMotionSupported(typeof window !== 'undefined' && 'DeviceOrientationEvent' in window);
  }, []);
  const enableMotion = async () => {
    if (!motionSupported) return;
    try {
      type MotionRequest = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
      const ctor = window.DeviceOrientationEvent as MotionRequest | undefined;
      if (ctor?.requestPermission && await ctor.requestPermission() !== 'granted') {
        setMotionError('دسترسی به حسگر حرکت داده نشد؛ نخ چراغ همچنان کار می‌کند.');
        return;
      }
      setMotionError('');
      setMotionEnabled(true);
    } catch {
      setMotionError('حسگر حرکت در دسترس نیست؛ کنترل دستی چراغ فعال است.');
    }
  };
  useEffect(() => {
    if (!motionEnabled) return;
    let last = 0;
    let smoothed = 0;
    let frame = 0;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || !Number.isFinite(event.gamma)) return;
      // A maximum 30-degree swing, independent of device orientation extremes.
      motionTargetRef.current = Math.max(-30, Math.min(30, event.gamma * 0.75));
    };
    const animate = (time: number) => {
      const delta = last ? Math.min(50, time - last) : 16;
      last = time;
      const ease = 1 - Math.exp(-delta / 210);
      smoothed += (motionTargetRef.current - smoothed) * ease;
      setDeviceTilt(prev => Math.abs(prev - smoothed) > 0.05 ? smoothed : prev);
      frame = requestAnimationFrame(animate);
    };
    window.addEventListener('deviceorientation', onOrientation, { passive: true });
    frame = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      cancelAnimationFrame(frame);
      motionTargetRef.current = 0;
      setDeviceTilt(0);
    };
  }, [motionEnabled]);

  // Pointer drag events - multidirectional downward pulling
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setIsBouncing(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    startPosRef.current = { x: e.clientX, y: e.clientY };
    currentPosRef.current = { x: 0, y: 0 };

    if (pullRef.current) {
      pullRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;

    if (dy > 0) {
      const resistedY = PULL_MAX_Y * (1 - Math.exp(-dy / 58));
      const resistedX = Math.max(-PULL_MAX_X, Math.min(PULL_MAX_X, dx * 0.8));
      currentPosRef.current = { x: resistedX, y: resistedY };
      setPullOffset({ x: resistedX, y: resistedY });
      setLampTilt((resistedX / PULL_MAX_X) * 2.2);
    } else {
      currentPosRef.current = { x: 0, y: 0 };
      setPullOffset({ x: 0, y: 0 });
      setLampTilt(0);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    suppressClickRef.current = true;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    setIsDragging(false);
    try {
      if (pullRef.current && pullRef.current.hasPointerCapture(e.pointerId)) {
        pullRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Pointer capture guard
    }

    const dy = currentPosRef.current.y;
    const dx = currentPosRef.current.x;
    const isTap = Math.hypot(dx, dy) < 6;
    const shouldToggle = dy >= PULL_THRESHOLD || isTap;
    animateSpringReturn(dx, dy > 5 ? dy : 42, shouldToggle);
  };

  const handlePointerCancel = () => {
    setIsDragging(false);
    setPullOffset({ x: 0, y: 0 });
    setLampTilt(0);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  };

  const handleQuickClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (isDragging || isBouncing) return;
    animateSpringReturn(0, 48, true);
  };

  // Coordinates for the elongated luxury pull string & bead (made slightly longer per request)
  const anchorX = 206;
  const anchorY = 124;
  const targetX = 206 + pullOffset.x;
  const targetY = 278 + pullOffset.y;
  const controlX = anchorX + pullOffset.x * 0.35;
  const controlY = (anchorY + targetY) * 0.5;

  return (
    <div
      className={`relative select-none flex flex-col items-center justify-center shrink-0 ${className}`}
      dir="ltr"
    >
      {/* ================= ULTRA-LUXURY ARCHITECTURAL 3D FLOOR LAMP ================= */}
      <div className="relative z-20 w-(--size-95) xs:w-(--size-112) sm:w-(--size-180) md:w-(--size-240) lg:w-(--size-280) h-(--size-370) xs:h-(--size-410) sm:h-(--size-480) md:h-(--size-540) lg:h-(--size-580) flex items-center justify-center">
        <svg
          viewBox="0 0 320 620"
          className="w-full h-full overflow-visible drop-shadow-2xl"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            transform: `rotate(${Math.max(-30, Math.min(30, lampTilt + (isDragging || isBouncing ? 0 : deviceTilt)))}deg)`,
            transformOrigin: '160px 2px',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          <defs>
            {/* Lamp Shade Obsidian / Matte Charcoal Multi-Stop Gradient */}
            <linearGradient id="shadeLuxuryMatte" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--c-navy-dark) 85%, black)" />
              <stop offset="25%" stopColor="color-mix(in srgb, var(--c-navy-dark) 45%, black)" />
              <stop offset="65%" stopColor="black" />
              <stop offset="100%" stopColor="black" />
            </linearGradient>

            {/* Lamp Shade Brushed Metallic Highlight */}
            <linearGradient id="shadeSpecularLuxury" x1="15%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="color-mix(in srgb, white 32%, transparent)" />
              <stop offset="25%" stopColor="color-mix(in srgb, white 8%, transparent)" />
              <stop offset="70%" stopColor="transparent" />
            </linearGradient>

            {/* 18K Luxury Gold Gradients for turned collars, finials and pull bead */}
            <linearGradient id="goldLuxuryBrushed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--c-warning-soft)" />
              <stop offset="25%" stopColor="var(--c-accent)" />
              <stop offset="50%" stopColor="var(--c-copper)" />
              <stop offset="75%" stopColor="color-mix(in srgb, var(--c-copper) 80%, black)" />
              <stop offset="100%" stopColor="var(--c-ink-main)" />
            </linearGradient>

            <linearGradient id="goldHorizontalSheen" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--c-copper) 70%, black)" />
              <stop offset="25%" stopColor="var(--c-copper)" />
              <stop offset="50%" stopColor="color-mix(in srgb, var(--c-warning-soft) 90%, white)" />
              <stop offset="75%" stopColor="var(--c-copper)" />
              <stop offset="100%" stopColor="color-mix(in srgb, var(--c-copper) 70%, black)" />
            </linearGradient>

            {/* Stand Metallic Tall Pole Gradient */}
            <linearGradient id="standRodLuxury" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="black" />
              <stop offset="35%" stopColor="color-mix(in srgb, var(--c-navy-light) 65%, black)" />
              <stop offset="55%" stopColor="color-mix(in srgb, var(--c-navy-light) 90%, black)" />
              <stop offset="70%" stopColor="color-mix(in srgb, var(--c-navy-dark) 85%, black)" />
              <stop offset="100%" stopColor="black" />
            </linearGradient>

            {/* Base Pedestal Gradient */}
            <linearGradient id="basePedestalLuxury" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--c-navy-light) 45%, black)" />
              <stop offset="25%" stopColor="color-mix(in srgb, var(--c-navy-dark) 75%, black)" />
              <stop offset="70%" stopColor="color-mix(in srgb, var(--c-navy-dark) 95%, black)" />
              <stop offset="100%" stopColor="black" />
            </linearGradient>

            {/* Volumetric Indigo Gradients & Blurs */}
            <filter id="mistyHazeBlurLux" x="-60%" y="-40%" width="220%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="30" />
            </filter>

            <filter id="softBeamBlurLux" x="-40%" y="-30%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="15" />
            </filter>

            <filter id="coreGlowBlurLux" x="-30%" y="-20%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
            </filter>

            <filter id="poolBlurLux" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="18" />
            </filter>

            <filter id="emeraldBulbGlowLux" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Volumetric Emerald Gradient: Velvety mist cone */}
            <linearGradient id="emeraldVelvetHazeLux" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--c-cobalt)" stopOpacity="0.82" />
              <stop offset="25%" stopColor="var(--c-forest-light)" stopOpacity="0.5" />
              <stop offset="65%" stopColor="var(--c-cobalt)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--c-forest-dark)" stopOpacity="0" />
            </linearGradient>

            {/* Volumetric Emerald Gradient: Mid Beam */}
            <linearGradient id="emeraldMidBeamLux" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="15%" stopColor="var(--c-forest-light)" stopOpacity="0.7" />
              <stop offset="55%" stopColor="var(--c-cobalt)" stopOpacity="0.3" />
              <stop offset="90%" stopColor="var(--c-cobalt-dark)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>

            {/* Volumetric Emerald Gradient: Intense Core */}
            <linearGradient id="emeraldCoreFilamentLux" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity="0.95" />
              <stop offset="20%" stopColor="var(--c-forest-light)" stopOpacity="0.65" />
              <stop offset="65%" stopColor="var(--c-cobalt)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>

            {/* Table Floor Pool Glow */}
            <radialGradient id="tablePoolGlowLux" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--c-forest-light)" stopOpacity="0.8" />
              <stop offset="35%" stopColor="var(--c-cobalt)" stopOpacity="0.45" />
              <stop offset="70%" stopColor="var(--c-forest-dark)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="litBulbGradLux" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="white" />
              <stop offset="25%" stopColor="var(--c-forest-light)" />
              <stop offset="60%" stopColor="var(--c-cobalt)" />
              <stop offset="90%" stopColor="var(--c-cobalt-dark)" />
              <stop offset="100%" stopColor="var(--c-forest-dark)" />
            </radialGradient>

            {/* Off State: Pure matte black/charcoal bulb aperture with zero green tint */}
            <radialGradient id="unlitBulbGradLux" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--c-navy-dark) 50%, black)" />
              <stop offset="60%" stopColor="black" />
              <stop offset="100%" stopColor="black" />
            </radialGradient>
          </defs>

          {/* ================= VOLUMETRIC EMERALD LIGHT CONE (Only rendered when ON) ================= */}
          {isLightOn && (
            <g className="transition-opacity duration-1000 ease-out pointer-events-none opacity-100">
              {/* Layer 1: Wide atmospheric velvety mist cone */}
              <polygon
                points="142,124 178,124 315,580 5,580"
                fill="url(#emeraldVelvetHazeLux)"
                filter="url(#mistyHazeBlurLux)"
              />

              {/* Layer 2: Mid volumetric beam */}
              <polygon
                points="148,124 172,124 280,580 40,580"
                fill="url(#emeraldMidBeamLux)"
                filter="url(#softBeamBlurLux)"
              />

              {/* Layer 3: High-intensity inner core */}
              <polygon
                points="154,124 166,124 230,580 90,580"
                fill="url(#emeraldCoreFilamentLux)"
                filter="url(#coreGlowBlurLux)"
              />

              {/* Layer 4: Soft elliptical table floor reflection */}
              <ellipse
                cx="160"
                cy="570"
                rx="115"
                ry="26"
                fill="url(#tablePoolGlowLux)"
                filter="url(#poolBlurLux)"
              />

              {/* Layer 5: Luminous floating dust motes & fireflies */}
              {[
                { cx: 156, cy: 180, r: 2.0, dur: '3.6s', delay: '0s' },
                { cx: 174, cy: 245, r: 2.4, dur: '4.4s', delay: '1.2s' },
                { cx: 142, cy: 315, r: 1.8, dur: '4.0s', delay: '2.4s' },
                { cx: 188, cy: 385, r: 2.6, dur: '4.8s', delay: '0.8s' },
                { cx: 150, cy: 455, r: 1.7, dur: '3.8s', delay: '1.8s' },
                { cx: 175, cy: 520, r: 2.2, dur: '4.6s', delay: '2.8s' },
              ].map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.cx}
                  cy={pt.cy}
                  r={pt.r}
                  fill="var(--c-forest-light)"
                  style={{
                    filter: 'drop-shadow(0 0 8px var(--c-cobalt))',
                    animation: `lampFirefly ${pt.dur} infinite ease-in-out ${pt.delay}`,
                  }}
                />
              ))}
            </g>
          )}

          {/* ================= SUSPENDED PENDANT — no floor stand ================= */}
          {/* Ceiling rosette and the slim metal suspension wire. The entire scene
              pivots from this attachment when the phone is tilted. */}
          <ellipse cx="160" cy="2" rx="24" ry="4.5" fill="url(#basePedestalLuxury)"
            stroke="var(--c-copper)" strokeWidth="0.8" />
          <path d="M160 4 L160 50" stroke="url(#goldHorizontalSheen)"
            strokeWidth="2.2" strokeLinecap="round" />
          <path d="M158.8 4 L158.8 49" stroke="color-mix(in srgb, white 38%, transparent)"
            strokeWidth="0.55" />
          <rect x="155.5" y="46" width="9" height="7" rx="2" fill="url(#goldLuxuryBrushed)" />
          <ellipse cx="160" cy="52" rx="8" ry="3" fill="url(#goldHorizontalSheen)" />

          {/* Large Architectural Dome Canopy (Shade Hood) */}
          <path
            d="M 96,124 C 96,62 124,52 160,52 C 196,52 224,62 224,124 Z"
            fill="url(#shadeLuxuryMatte)"
            stroke="color-mix(in srgb, white 16%, transparent)"
            strokeWidth="1.2"
          />
          {/* Curved specular brushed highlight across the dome */}
          <path
            d="M 100,124 C 100,66 126,56 160,56 C 182,56 204,64 216,88 C 182,74 136,84 100,124 Z"
            fill="url(#shadeSpecularLuxury)"
          />

          {/* Lamp Shade Bottom Lip & Turned Gold Edge Rim */}
          <ellipse cx="160" cy="124" rx="64" ry="11" fill="black" stroke="color-mix(in srgb, white 20%, transparent)" strokeWidth="1" />
          <ellipse cx="160" cy="124" rx="62" ry="10" fill="none" stroke="url(#goldHorizontalSheen)" strokeWidth="1.4" opacity="0.9" />

          {/* Inner Glowing Bulb Aperture */}
          <ellipse
            cx="160"
            cy="124"
            rx="46"
            ry="8"
            fill={isLightOn ? 'url(#litBulbGradLux)' : 'url(#unlitBulbGradLux)'}
            filter={isLightOn ? 'url(#emeraldBulbGlowLux)' : undefined}
          />

          {/* High-intensity Light Filament Core (Only when lit) */}
          {isLightOn && (
            <ellipse
              cx="160"
              cy="124"
              rx="24"
              ry="4"
              fill="white"
              filter="url(#emeraldBulbGlowLux)"
            />
          )}

          {/* Chain Anchor Hole under the right side of the shade */}
          <circle cx="206" cy="124" r="3" fill="var(--c-accent)" stroke="var(--c-copper)" strokeWidth="0.6" />

          {/* Smooth curved beaded pull chain extending down significantly */}
          <path
            d={`M ${anchorX},${anchorY} Q ${controlX},${controlY} ${targetX},${targetY}`}
            stroke="url(#goldLuxuryBrushed)"
            strokeWidth="2.2"
            strokeDasharray="3 1.8"
            strokeLinecap="round"
            fill="none"
            style={{ filter: 'drop-shadow(0 2px 4px color-mix(in srgb, black 60%, transparent))' }}
          />

          {/* ================= HIGH-END LUXURY GOLD & JEWEL PULL BEAD ================= */}
          <g transform={`translate(${targetX}, ${targetY})`}>
            {/* Upper Swivel Ring */}
            <circle cx="0" cy="0" r="3.5" fill="none" stroke="url(#goldLuxuryBrushed)" strokeWidth="1.5" />
            <circle cx="0" cy="5" r="2.5" fill="url(#goldLuxuryBrushed)" />

            {/* Fluted amphora golden handle bead */}
            <path
              d="M -5,8 L 5,8 C 7,14 6,24 4,28 L -4,28 C -6,24 -7,14 -5,8 Z"
              fill="url(#goldHorizontalSheen)"
              stroke="var(--c-copper)"
              strokeWidth="0.8"
            />

            {/* Inset Faceted Indigo / Diamond Jewel in the bead core */}
            <ellipse cx="0" cy="18" rx="2.8" ry="4.5" fill={isLightOn ? 'var(--c-cobalt)' : 'color-mix(in srgb, var(--c-navy-dark) 80%, black)'} stroke="var(--c-accent)" strokeWidth="0.6" />
            <ellipse cx="-0.8" cy="16.5" rx="1.2" ry="2" fill="color-mix(in srgb, white 85%, transparent)" />

            {/* Lower Turned Gold Accent Collar */}
            <rect x="-3" y="28" width="6" height="3" rx="1" fill="url(#goldLuxuryBrushed)" />
            {/* Dangling Gold Teardrop Finial */}
            <path d="M 0,31 C -2.5,33 -3,37 0,40 C 3,37 2.5,33 0,31 Z" fill="url(#goldLuxuryBrushed)" stroke="var(--c-copper)" strokeWidth="0.6" />
            <circle cx="0" cy="40.5" r="1.5" fill="var(--c-warning-soft)" />

            {/* Soft breathing pulse around bead when lamp is OFF to invite pull */}
            {!isLightOn && (
              <circle
                cx="0"
                cy="22"
                r="18"
                fill="none"
                stroke="color-mix(in srgb, var(--c-accent) 65%, transparent)"
                strokeWidth="1.6"
                className="lamp-bead-breathe pointer-events-none"
              />
            )}
          </g>
        </svg>

        {/* Generous Multidirectional Pull Interaction Zone (Centered directly over the bead at targetX) */}
        <div
          ref={pullRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleQuickClick}
          className="absolute z-30 cursor-grab active:cursor-grabbing touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-4 focus-visible:ring-offset-black"
          style={{
            left: `calc(50% + ${(targetX - 160) * 0.95}px - 38px)`,
            top: `${(targetY / 620) * 100 - 8}%`,
            width: 'var(--size-76)',
            height: 'var(--size-92)',
          }}
          title={isLightOn ? 'برای خاموش کردن، نخ را به هر سمتی به پایین بکشید' : 'برای روشن کردن، نخ را به هر سمتی به پایین بکشید'}
          aria-label={isLightOn ? 'کشیدن نخ برای خاموش کردن آباژور' : 'کشیدن نخ برای روشن کردن آباژور'}
          aria-pressed={isLightOn}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              animateSpringReturn(0, 48, true);
            }
          }}
        />
      </div>

      {motionSupported && (
        <div className="relative z-30 -mt-2 flex flex-col items-center gap-1 text-center">
          <button
            type="button"
            onClick={() => motionEnabled ? setMotionEnabled(false) : void enableMotion()}
            aria-pressed={motionEnabled}
            className="rounded-full border border-(--c-copper)/35 bg-(--c-auth-ambient)/70 px-3 py-1.5 text-xs text-(--c-auth-on-ambient) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-copper)"
          >
            {motionEnabled ? 'توقف حرکت با گوشی' : 'فعال‌سازی حرکت چراغ با گوشی'}
          </button>
          {motionError && <p role="status" className="max-w-48 text-xs text-(--c-auth-on-ambient)/75">{motionError}</p>}
        </div>
      )}
      <style>{`
        @keyframes lamp-bead-breathe {
          0%, 100% { opacity: .18; transform: scale(.92); }
          50% { opacity: .72; transform: scale(1.12); }
        }
        @keyframes lampFirefly {
          0%, 100% {
            transform: translateY(0px) translateX(0px) scale(0.8);
            opacity: 0.35;
          }
          50% {
            transform: translateY(-22px) translateX(8px) scale(1.3);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
