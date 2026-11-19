/** نسخه محصول (منبع واحد؛ با package.json هم‌خوان نگه داشته شود). */
export const APP_VERSION = '0.12.62';
export const APP_RELEASE = {
  round: 14,
  checkpoint: 4,
  label: 'r14-cp28-reportsworkspace-any-reduction',
  base: 'r13-cp28-audit-fixes'
} as const;
export const APP_VERSION_LABEL = `AKHAVAN CRM v${APP_VERSION} · ${APP_RELEASE.label}`;
