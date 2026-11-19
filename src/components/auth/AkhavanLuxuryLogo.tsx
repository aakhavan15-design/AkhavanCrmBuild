import React from 'react';

interface AkhavanLuxuryLogoProps {
  className?: string;
  isLightOn?: boolean;
}

/**
 * AKHAVAN GROUP — High-Luxury Vector Identity
 * 100% transparent vector SVG (zero dark rectangular background box, zero raster compression artifacts).
 * Faithfully mirrors the luxury monogram signature 'A', geometric architectural lettering 'Λ K H Λ V Λ N',
 * and the '— G R O U P —' baseline with champagne gold metallic gradients.
 * Strictly complies with designSystem2026Contracts (no hex, no rgba).
 */
export function AkhavanLuxuryLogo({ className = '', isLightOn = true }: AkhavanLuxuryLogoProps) {
  return (
    <div
      className={`relative select-none flex flex-col items-center justify-center transition-all duration-500 ${className}`}
      dir="ltr"
    >
      <svg
        viewBox="0 0 420 200"
        className="w-full h-auto max-w-(--size-280) xs:max-w-(--size-320) sm:max-w-(--size-360) md:max-w-(--size-390) overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: isLightOn
            ? 'drop-shadow(0 2px 14px color-mix(in srgb, var(--c-copper) 32%, transparent))'
            : 'drop-shadow(0 1px 8px color-mix(in srgb, var(--c-copper) 18%, transparent))',
        }}
        aria-label="نشان تجاری گروه اخوان"
      >
        <defs>
          {/* Champagne & 18K Rose Gold Gradient */}
          <linearGradient id="akhavanGoldMetallic" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--c-warning-soft)" />
            <stop offset="28%" stopColor="var(--c-accent)" />
            <stop offset="68%" stopColor="var(--c-copper)" />
            <stop offset="100%" stopColor="color-mix(in srgb, var(--c-copper) 80%, black)" />
          </linearGradient>

          {/* High-Specularity Specular Gold Sheen */}
          <linearGradient id="akhavanSpecularSheen" x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--c-warning-soft) 85%, white)" />
            <stop offset="45%" stopColor="var(--c-accent)" />
            <stop offset="85%" stopColor="var(--c-copper)" />
            <stop offset="100%" stopColor="var(--c-ink-main)" />
          </linearGradient>

          {/* Linear Gradient for Architectural Lettering */}
          <linearGradient id="akhavanLetteringGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--c-warning-soft) 95%, white)" />
            <stop offset="40%" stopColor="var(--c-accent)" />
            <stop offset="85%" stopColor="var(--c-copper)" />
            <stop offset="100%" stopColor="color-mix(in srgb, var(--c-copper) 70%, black)" />
          </linearGradient>
        </defs>

        {/* ================= 1. THE CALLIGRAPHIC SIGNATURE MONOGRAM 'A' ================= */}
        <g id="akhavan-monogram" transform="translate(210, 60)">
          {/* Main Diagonal Needle Strike (Starts bottom-left, ascends sharply to top-right needle point) */}
          <path
            d="M -12,42 C -4,22 14,-14 26,-46 C 26.8,-48 28.2,-48 27.5,-45 C 23,-25 9,12 -3,40 C -4.5,43.5 -10,45 -12,42 Z"
            fill="url(#akhavanSpecularSheen)"
          />

          {/* Sweeping Flourish Loop Ribbon (Cradles from left, loops through center, extends dramatically to bottom right) */}
          <path
            d="M -54,-1 C -42,-14 -18,-15 4,-2 C 18,7 34,18 58,26 C 60,26.8 59,28 56.5,27.5 C 32,20 15,9 0,0 C -18,-11 -38,-10 -48,-1 C -54,4 -56,12 -50,17 C -42,23 -26,20 -10,12 C 1,6 12,1 19,-2 C 20.5,-2.8 21,-1.5 19.5,-0.8 C 11,2.8 -1,8 -12,14 C -28,23 -46,25 -55,18 C -62,12 -61,-2 -54,-1 Z"
            fill="url(#akhavanGoldMetallic)"
          />

          {/* Intersecting Subtle Cross Highlight */}
          <path
            d="M -22,14 C 4,11 26,16 48,24 C 50,24.8 49,25.8 46.5,25.2 C 25,18 3,13 -22,15.5 C -23.5,15.7 -23.5,14.1 -22,14 Z"
            fill="url(#akhavanSpecularSheen)"
            opacity="0.85"
          />
        </g>

        {/* ================= 2. ARCHITECTURAL LUXURY TYPOGRAPHY 'Λ K H Λ V Λ N' ================= */}
        <g id="akhavan-wordmark" transform="translate(210, 136)">
          {/* Letter 1: 'Λ' (Apex Chevron, no crossbar) */}
          <g transform="translate(-165, 0)">
            <path
              d="M 0,22 L 14,-20 L 17,-20 L 31,22 L 25.5,22 L 15.5,-12 L 5.5,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
          </g>

          {/* Letter 2: 'K' */}
          <g transform="translate(-112, 0)">
            <path
              d="M 0,-20 L 5.5,-20 L 5.5,22 L 0,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
            {/* Upper diagonal arm */}
            <path
              d="M 4,3 L 18,-20 L 25,-20 L 9.5,-1 Z"
              fill="url(#akhavanLetteringGrad)"
            />
            {/* Lower diagonal leg */}
            <path
              d="M 7.5,-3 L 24,22 L 17.5,22 L 3.5,1.5 Z"
              fill="url(#akhavanLetteringGrad)"
            />
          </g>

          {/* Letter 3: 'H' */}
          <g transform="translate(-62, 0)">
            <path
              d="M 0,-20 L 5.5,-20 L 5.5,22 L 0,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
            <path
              d="M 21,-20 L 26.5,-20 L 26.5,22 L 21,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
            <rect
              x="5.5"
              y="-1"
              width="15.5"
              height="3.5"
              fill="url(#akhavanLetteringGrad)"
            />
          </g>

          {/* Letter 4: 'Λ' (Apex Chevron) */}
          <g transform="translate(-15, 0)">
            <path
              d="M 0,22 L 14,-20 L 17,-20 L 31,22 L 25.5,22 L 15.5,-12 L 5.5,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
          </g>

          {/* Letter 5: 'V' */}
          <g transform="translate(38, 0)">
            <path
              d="M 0,-20 L 5.5,-20 L 15.5,14 L 25.5,-20 L 31,-20 L 17,22 L 14,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
          </g>

          {/* Letter 6: 'Λ' (Apex Chevron) */}
          <g transform="translate(90, 0)">
            <path
              d="M 0,22 L 14,-20 L 17,-20 L 31,22 L 25.5,22 L 15.5,-12 L 5.5,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
          </g>

          {/* Letter 7: 'N' */}
          <g transform="translate(142, 0)">
            <path
              d="M 0,-20 L 5.5,-20 L 5.5,22 L 0,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
            <path
              d="M 4.5,-20 L 22,17 L 22,-20 L 27,-20 L 27,22 L 22,22 L 4.5,-15 Z"
              fill="url(#akhavanLetteringGrad)"
            />
            <path
              d="M 22,-20 L 27,-20 L 27,22 L 22,22 Z"
              fill="url(#akhavanLetteringGrad)"
            />
          </g>
        </g>

        {/* ================= 3. SUBTITLE '— G R O U P —' ================= */}
        <g id="akhavan-subtitle" transform="translate(210, 172)">
          {/* Left Fine Dash */}
          <line
            x1="-82"
            y1="-2"
            x2="-52"
            y2="-2"
            stroke="url(#akhavanGoldMetallic)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          {/* Spaced Word 'G R O U P' */}
          <text
            x="0"
            y="2"
            textAnchor="middle"
            fill="url(#akhavanGoldMetallic)"
            fontSize="10"
            fontWeight="500"
            letterSpacing="0.45em"
            fontFamily="sans-serif"
          >
            GROUP
          </text>

          {/* Right Fine Dash */}
          <line
            x1="52"
            y1="-2"
            x2="82"
            y2="-2"
            stroke="url(#akhavanGoldMetallic)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}
