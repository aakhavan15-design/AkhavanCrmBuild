/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { 50: 'var(--c-primary-soft)', 100: 'var(--c-primary-soft)', 500: 'var(--c-primary)', 600: 'var(--c-primary)', 700: 'var(--c-primary-hover)', 800: 'var(--c-primary-pressed)', DEFAULT: 'var(--c-primary)' },
        canvas: 'var(--c-canvas)', surface: 'var(--c-surface)', ink: { DEFAULT: 'var(--c-ink-main)', soft: 'var(--c-ink-secondary)' },
        success: { DEFAULT: 'var(--c-success)', soft: 'var(--c-success-soft)' },
        warning: { DEFAULT: 'var(--c-warning)', soft: 'var(--c-warning-soft)' },
        danger: { DEFAULT: 'var(--c-danger)', soft: 'var(--c-danger-soft)' },
        info: { DEFAULT: 'var(--c-info)', soft: 'var(--c-info-soft)' },
      },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', '2xl': 'var(--radius-2xl)' },
      boxShadow: { xs: 'var(--shadow-sm)', sm: 'var(--shadow-sm)', md: 'var(--shadow-card)', lg: 'var(--shadow-floating)', floating: 'var(--shadow-floating)' },
    }
  },
  plugins: []
};
