import React, { useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { resolveCustomerBalanceView, balanceNature, type SubsidiaryBalance, type BalanceNature } from '../../lib/receivableReconciliation';
import { formatCurrency, cn } from '../../lib/utils';
import { Card } from '../ui/Card';

/**
 * مانده تفکیکی «تفصیلی × معین» با Drill-down گردش هر معین (F0-13، قانون اساسی §C).
 * داده فقط از DataProvider؛ بدون مجوز مالی (enabled=false) هیچ درخواستی ارسال نمی‌شود.
 * مانده کل فقط تجمیع تفکیکی‌هاست و کنار آن‌ها می‌آید؛ سطر بدون معین = «فاقد نگاشت».
 */
const NATURE_LABEL: Record<BalanceNature, string> = { DEBIT: 'بدهکار', CREDIT: 'بستانکار', SETTLED: 'تسویه‌شده' };
const NATURE_CLS: Record<BalanceNature, string> = { DEBIT: 'text-danger', CREDIT: 'text-success', SETTLED: 'text-text-secondary' };

export interface SubsidiaryBalancesPanelProps {
  account: { id?: string; code?: string; detailAccountId?: string; externalDetailCode?: string };
  enabled: boolean;
  /** برای بازخوانی پس از تغییر گردش */
  refreshKey?: number;
}

function Movements({ detailKey, row }: { detailKey: string; row: SubsidiaryBalance }) {
  const { data, loading, error } = useDataQuery(
    p => p.getJournalLines({ detailKey, ...(row.subsidiaryCode ? { subsidiaryCode: row.subsidiaryCode } : { unmapped: true }) }, { page: 1, pageSize: 20 }),
    [detailKey, row.subsidiaryCode]
  );
  if (loading) return <div className="h-10 animate-pulse rounded-lg bg-canvas" aria-busy="true" />;
  if (error) return <p className="py-2 text-micro text-danger">گردش در دسترس نیست؛ منبع داده پاسخ نداد.</p>;
  const items = data?.items || [];
  if (!items.length) return <p className="py-2 text-micro text-text-secondary">گردشی برای این معین ثبت نشده است.</p>;
  return (
    <div className="divide-y divide-border/60" role="list" aria-label="گردش معین">
      {items.map((it: any, i: number) => {
        const debit = Number(it.debitAmount) || 0, credit = Number(it.creditAmount) || 0;
        return (
          <div key={String(it.id ?? i)} role="listitem" className="flex items-center justify-between gap-2 py-1.5 text-micro">
            <div className="min-w-0">
              <span className="block truncate text-text-main">{String(it.description ?? it.documentNumber ?? it.documentId ?? '—')}</span>
              <span className="block font-mono text-text-secondary">{String(it.documentDate ?? it.date ?? '')}</span>
            </div>
            <span className={cn('shrink-0 font-mono tabular-nums', debit ? 'text-danger' : 'text-success')}>
              {debit ? `${formatCurrency(debit)} بد` : `${formatCurrency(credit)} بس`}
            </span>
          </div>
        );
      })}
      {data && data.total > items.length && <p className="pt-1.5 text-micro text-text-secondary">{items.length.toLocaleString('fa-IR')} از {data.total.toLocaleString('fa-IR')} سطر نمایش داده شد.</p>}
    </div>
  );
}

export function SubsidiaryBalancesPanel({ account, enabled, refreshKey = 0 }: SubsidiaryBalancesPanelProps) {
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error } = useDataQuery(async p => (enabled ? p.getDetailSubsidiaryBalances() : null), [enabled, refreshKey]);
  if (!enabled) return null;
  const view = error ? ({ kind: 'UNAVAILABLE' } as const) : data ? resolveCustomerBalanceView(data, account) : ({ kind: 'LOADING' } as const);

  return (
    <Card padding="md" className="space-y-2 rounded-xl border border-border" data-testid="subsidiary-balances">
      <span className="block text-xs font-bold text-text-main">مانده تفکیکی به‌ازای معین</span>
      {(loading || view.kind === 'LOADING') && <div className="h-16 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}
      {view.kind === 'UNAVAILABLE' && <p className="py-2 text-xs text-text-secondary">منبع مانده در دسترس نیست؛ عددی حدس زده نمی‌شود.{('reason' in view && view.reason) ? ` (${view.reason})` : ''}</p>}
      {view.kind === 'NO_LEDGER' && <p className="py-2 text-xs text-text-secondary">برای این مشتری گردش دفتر کل ثبت نشده است.</p>}
      {view.kind === 'OK' && (
        <>
          <div className="divide-y divide-border/60">
            {view.subsidiaries.map(row => {
              const rowId = row.subsidiaryCode ?? '__unmapped__';
              const expanded = open === rowId;
              return (
                <div key={rowId} className="py-2">
                  <button type="button" onClick={() => setOpen(expanded ? null : rowId)} aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-2 text-start text-xs min-h-11 focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="min-w-0">
                      <span className="block font-bold text-text-main">{row.subsidiaryCode ? `معین ${row.subsidiaryCode}` : 'فاقد نگاشت معین'}</span>
                      <span className="block text-micro text-text-secondary">{row.lineCount.toLocaleString('fa-IR')} سطر گردش</span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className={cn('block font-mono font-bold tabular-nums', NATURE_CLS[row.nature])}>{formatCurrency(Math.abs(row.balance))} ریال</span>
                      <span className="block text-micro text-text-secondary">{NATURE_LABEL[row.nature]}</span>
                    </span>
                  </button>
                  {expanded && <div className="mt-1 rounded-lg bg-canvas/60 px-2"><Movements detailKey={view.detailKey} row={row} /></div>}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
            <span className="text-text-secondary">جمع تفصیلی (تجمیع معین‌ها){view.incomplete ? ' — ناقص: بخشی فاقد نگاشت' : ''}</span>
            <span className={cn('font-mono font-bold tabular-nums', NATURE_CLS[balanceNature(view.total)])}>{formatCurrency(Math.abs(view.total))} ریال · {NATURE_LABEL[balanceNature(view.total)]}</span>
          </div>
        </>
      )}
    </Card>
  );
}
