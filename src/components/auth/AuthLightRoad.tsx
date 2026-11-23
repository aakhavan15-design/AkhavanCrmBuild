import React from 'react';

interface AuthLightRoadProps {
  isLightOn: boolean;
}

/**
 * Decorative copper light road and floating A, composed as scalable vectors.
 * It never overlays the login fields or provides a second authentication path.
 */
export function AuthLightRoad({isLightOn}: AuthLightRoadProps) {
  return (
    <div aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        opacity: isLightOn ? 0.88 : 0.10,
        transition: 'opacity 900ms ease',
      }}>
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg" role="presentation">
        <defs>
          <linearGradient id="authRoadCopper" x1="0" y1="0" x2="0.96" y2="0.35">
            <stop offset="0" stopColor="var(--c-copper)" stopOpacity=".04"/>
            <stop offset=".4" stopColor="var(--c-accent)" stopOpacity=".7"/>
            <stop offset=".64" stopColor="var(--c-warning-soft)" stopOpacity="1"/>
            <stop offset="1" stopColor="var(--c-copper)" stopOpacity=".07"/>
          </linearGradient>
          <radialGradient id="authRoadHaze">
            <stop offset="0" stopColor="var(--c-copper)" stopOpacity=".35"/>
            <stop offset=".65" stopColor="var(--c-copper)" stopOpacity=".09"/>
            <stop offset="1" stopColor="var(--c-copper)" stopOpacity="0"/>
          </radialGradient>
          <filter id="authRoadGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="7"/>
          </filter>
          <linearGradient id="authRoadMonogram" x1="0" y1="0" x2=".8" y2="1">
            <stop offset="0" stopColor="var(--c-warning-soft)"/>
            <stop offset=".5" stopColor="var(--c-accent)"/>
            <stop offset="1" stopColor="var(--c-copper)"/>
          </linearGradient>
        </defs>
        <ellipse cx="445" cy="775" rx="740" ry="215" fill="url(#authRoadHaze)" opacity=".54"/>
        <g fill="none" stroke="url(#authRoadCopper)" strokeLinecap="round">
          <g opacity=".72" filter="url(#authRoadGlow)" strokeWidth="9">
            <path d="M-120 890 C290 680 750 900 595 620 S520 430 608 385"/>
            <path d="M100 925 C360 740 800 920 640 640 S570 440 640 391"/>
            <path d="M-300 840 C170 640 700 820 558 605 S520 433 608 385"/>
          </g>
          <path d="M-120 890 C290 680 750 900 595 620 S520 430 608 385" strokeWidth="3.2"/>
          <path d="M100 925 C360 740 800 920 640 640 S570 440 640 391" strokeWidth="1.9"/>
          <path d="M-300 840 C170 640 700 820 558 605 S520 433 608 385" strokeWidth="2.4"/>
          <path d="M260 900 C450 825 760 895 640 660 S575 452 638 388" strokeWidth="1.5"/>
          <path d="M-30 900 C300 800 710 895 565 630 S518 435 603 390" strokeWidth=".9"/>
        </g>
        <g transform="translate(615 363)" fill="none">
          <path d="M-80 69 Q-100 13-45-16 C-13-31 32-6 92 30 C42 18 3-15-39-8 C-73-4-81 23-57 30 C-24 40 19 3 46-87 C48-95 56-92 52-83 C29 5 2 81-2 86 C-12 93-10 71-8 60 C-37 79-69 83-80 69Z"
            stroke="url(#authRoadMonogram)" strokeWidth="3"
            filter="url(#authRoadGlow)" opacity=".7"/>
          <path d="M-80 69 Q-100 13-45-16 C-13-31 32-6 92 30 C42 18 3-15-39-8 C-73-4-81 23-57 30 C-24 40 19 3 46-87 C48-95 56-92 52-83 C29 5 2 81-2 86 C-12 93-10 71-8 60 C-37 79-69 83-80 69Z"
            stroke="url(#authRoadMonogram)" strokeWidth="1.8"/>
        </g>
      </svg>
    </div>
  );
}
