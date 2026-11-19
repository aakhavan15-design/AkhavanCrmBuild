/**
 * uiDensity — Content Density control 2026
 * compact | comfortable | spacious — user preference, applied via data-density on document/root.
 */
export type UiDensity = 'compact' | 'comfortable' | 'spacious';

export const DENSITY_LABELS: Record<UiDensity, string> = {
  compact: 'فشرده',
  comfortable: 'متعادل',
  spacious: 'باز',
};

export function resolveDensity(settings: { uiDensity?: string; orgConfig?: { uiDensity?: string } } | null | undefined): UiDensity {
  const raw = (settings as Record<string, unknown>)?.uiDensity || (settings as Record<string, unknown>)?.orgConfig?.uiDensity || 'comfortable';
  if (raw === 'compact' || raw === 'spacious' || raw === 'comfortable') return raw;
  return 'comfortable';
}

export function applyDensityToDocument(density: UiDensity) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.density = density;
}
