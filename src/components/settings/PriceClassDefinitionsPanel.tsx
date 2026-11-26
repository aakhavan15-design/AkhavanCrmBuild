/**
 * PriceClassDefinitionsPanel — تعاریف پایهٔ نام ۵ کلاس قیمت.
 * قیمت هر کلاس فقط از سامانه مرجع می‌آید؛ اینجا فقط «نام نمایشی» تعریف می‌شود.
 * اولویت نام: ERP ← تعریف دستی همین‌جا ← پیش‌فرض اعلام‌شده ← «کلاس قیمت N» (نام تجاری حدس زده نمی‌شود).
 */
import React from 'react';
import type { AppState } from '../../types';
import { resolvePriceClassLabels, type PriceClassCode } from '../../lib/cpqEngine';
import { InputControl } from '../ui/Input';
import { generateId } from '../../lib/utils';
import { formatNumber } from '../../lib/format';

interface Props {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  canEdit: boolean;
}

const SOURCE_LABEL = { ERP: 'از سامانه مرجع', MANUAL: 'تعریف دستی', DEFAULT: 'پیش‌فرض', NONE: 'نام‌گذاری نشده' } as const;

export function PriceClassDefinitionsPanel({ state, updateState, canEdit }: Props) {
  const manual = ((state.settings as Record<string, any> | undefined)?.orgConfig?.priceClassLabels || {}) as Partial<Record<PriceClassCode, string>>;
  const rows = resolvePriceClassLabels(manual, state.externalProducts);

  const commit = (code: PriceClassCode, raw: string) => {
    if (!canEdit) return;
    const next = raw.trim().slice(0, 40);
    if ((manual[code] || '') === next) return;
    updateState(draft => {
      const settings = (draft.settings ??= {}) as Record<string, any>;
      const org = (settings.orgConfig ??= {});
      const labels = { ...(org.priceClassLabels || {}) };
      if (next) labels[code] = next; else delete labels[code];
      org.priceClassLabels = labels;
      (draft.auditLogs ??= []).push({
        id: generateId(), action: 'ORG_PRICE_CLASS_LABEL_UPDATED', entityType: 'ORG_CONFIG', entityId: code,
        details: `نام نمایشی ${code} از «${manual[code] || 'بدون تعریف'}» به «${next || 'بدون تعریف'}» تغییر کرد.`,
        actor: draft.currentUserId || 'System', createdAt: new Date().toISOString()
      });
    });
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-canvas p-4 space-y-3" data-testid="price-class-definitions">
      <div>
        <h4 className="text-xs font-extrabold text-text-main">نام کلاس‌های قیمت (تعاریف پایه)</h4>
        <p className="mt-1 text-caption text-text-secondary">
          قیمت هر کالا در پنج کلاس و کف قیمت فقط از سامانه مرجع دریافت می‌شود. اگر منبع مرجع نام کلاس را ارسال کند همان نمایش داده می‌شود؛ در غیر این صورت نام تعریف‌شدهٔ شما به‌کار می‌رود.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((row, i) => (
          <div key={row.code}>
            <label className="mb-1 flex items-center justify-between text-xs font-bold text-text-main" htmlFor={`price-class-${row.code}`}>
              <span>کلاس {formatNumber(i + 1)}</span>
              <span className="text-micro font-normal text-ink-soft">{SOURCE_LABEL[row.source]}</span>
            </label>
            <InputControl
              id={`price-class-${row.code}`}
              type="text"
              maxLength={40}
              disabled={!canEdit}
              defaultValue={manual[row.code] ?? ''}
              placeholder={row.source === 'ERP' ? row.label : 'نام کلاس را وارد کنید'}
              onBlur={e => commit(row.code, e.target.value)}
            />
            {row.source === 'ERP' && <p className="mt-1 text-micro text-ink-soft">نام ثبت‌شده در منبع مرجع «{row.label}» اولویت دارد.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

