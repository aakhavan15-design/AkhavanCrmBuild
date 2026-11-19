import confetti from 'canvas-confetti';

/** رنگ‌ها از توکن‌های طراحی خوانده می‌شوند (بدون hex ثابت) تا با تم روز/شب هماهنگ بمانند. */
function readTokenColors(): string[] | undefined {
  if (typeof document === 'undefined') return undefined;
  const style = getComputedStyle(document.documentElement);
  const colors = ['--c-primary', '--c-success', '--c-warning', '--c-info']
    .map((name) => style.getPropertyValue(name).trim())
    .filter(Boolean);
  return colors.length ? colors : undefined;
}

/**
 * Fires a clean, ultra-minimal celebration confetti particle splash.
 */
export function fireSuccessConfetti() {
  try {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: readTokenColors(),
      disableForReducedMotion: true,
    });
  } catch {
    // Ignore in non-browser envs
  }
}
