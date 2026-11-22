import type { JournalLineFilter } from '../../lib/receivableReconciliation';
import React, { useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { resolveCustomerBalanceView, balanceNature, type SubsidiaryBalance, type BalanceNature } from '../../lib/receivableReconciliation';
import { formatCount, formatDecimalString, formatMoney } from '../../lib/format';
import { Button } from '../ui/Button';
import { formatAppDate, formatCurrency, cn } from '../../lib/utils';
import { Card } from '../ui/Card';
import { useLedgerBookScope } from '../../hooks/useLedgerBookScope';
import { useDataSyncStatus } from '../../services/dataSyncController';
import { LedgerBookSourceSelect } from '../finance/LedgerBookSourceSelect';

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
  viewer?: string | null;
  /** برای بازخوانی پس از تغییر گردش */
  refreshKey?: number;
}

export function LedgerMovementList({ filter, locale, unit = 'ریال' }: { filter: JournalLineFilter; locale?: unknown; unit?: string }) {
  const [page, setPage] = useState(1);
  const request = JSON.stringify(filter);
  const { data: result, loading, error, refetch } = useDataQuery(
    async provider => ({ request, data: await provider.getJournalLines(filter, { page, pageSize: 20 }) }), [request,page],
  );
  const data = result?.request===request ? result.data : null;
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-2 py-2 text-caption text-danger">
    <span>گردش در دسترس نیست.</span>
    <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>تلاش مجدد</Button>
  </div>;
  if (loading || !data || data.page !== page) return <p role="status" className="py-2 text-xs text-text-secondary">در حال دریافت گردش…</p>;
  const items = data?.items || [];
  if (!items.length) return <p className="py-2 text-caption text-text-secondary">گردشی در این محدوده یافت نشد.</p>;
  const money = (value: unknown) => {
    if (value == null || value === '') return 'نامشخص';
    if (typeof value==='string') return `${formatDecimalString(value)} ${unit}`;
    const amount = Number(value);
    return Number.isFinite(amount) ? formatMoney(amount,unit) : 'نامشخص';
  };
  return (
    <div className="space-y-1">
      <ul className="divide-y divide-border/60" aria-label="گردش دفتر کل">
        {items.map((item, index) => (
          <li key={String(item.id ?? index)} className="space-y-1 py-2 text-caption">
            <div className="flex flex-wrap justify-between gap-x-2">
              <span className="wrap-break-word text-text-main">سند <bdi>{String(item.documentNumber || item.documentId || 'نامشخص')}</bdi></span>
              <span className="text-text-secondary">{formatAppDate(String(item.documentDate || item.date || ''), locale)}</span>
            </div>
            {typeof item.description === 'string' && item.description.trim() && <p className="wrap-break-word text-text-secondary">{item.description}</p>}
            <p>بدهکار {money(item.debitAmount)} · بستانکار {money(item.creditAmount)}</p>
          </li>
        ))}
      </ul>
      {data && data.totalPages > 1 && <div className="flex flex-wrap items-center justify-between gap-1">
        <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</Button>
        <span role="status" className="text-caption">صفحهٔ {formatCount(page)} از {formatCount(data.totalPages)}</span>
        <Button type="button" variant="ghost" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>بعدی</Button>
      </div>}
    </div>
  );
}

export function SubsidiaryBalanceDetails({ detailKey, rows, byPeriod = false, locale }: {
  detailKey: string;
  rows: readonly SubsidiaryBalance[];
  byPeriod?: boolean;
  locale?: unknown;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return <div className="divide-y divide-border/60">
    {rows.map(row => {
      const id = JSON.stringify([detailKey, row.source, row.currency, row.role, row.subsidiaryCode, row.periodCode]);
      const expanded = open === id;
      const label = <span className="min-w-0">
        <span className="block font-bold text-text-main">{row.subsidiaryCode ? <>معین <bdi>{row.subsidiaryCode}</bdi></> : 'فاقد نگاشت معین'}</span>
        <span className="block text-caption text-text-secondary">
          {byPeriod && <>دوره <bdi>{row.periodCode || 'نامشخص'}</bdi> · </>}{formatCount(row.lineCount)} سطر
        </span>
      </span>;
      const value = <span className="shrink-0 text-end">
        <span className={cn('block font-mono font-bold tabular-nums', NATURE_CLS[row.nature])}>{formatMoney(Math.abs(row.balance))}</span>
        <span className="block text-caption text-text-secondary">{NATURE_LABEL[row.nature]}</span>
      </span>;
      return <div key={id} className="py-2">
        {byPeriod && !row.periodCode
          ? <div className="flex items-center justify-between gap-2 text-xs">{label}{value}</div>
          : <button type="button" onClick={() => setOpen(expanded ? null : id)} aria-expanded={expanded}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-start text-xs focus-visible:outline-2 focus-visible:outline-primary">
              {label}{value}
            </button>}
        {expanded && <div className="mt-1 rounded-lg bg-canvas/60 px-2">
          <LedgerMovementList key={id} locale={locale} filter={{
            detailKey, source:row.source, currency:row.currency, role:row.role,
            ...(row.source && row.currency==='IRR' ? { balanceWindow:true } : {}),
            ...(row.subsidiaryCode ? { subsidiaryCode:row.subsidiaryCode } : { unmapped:true }),
            ...(row.periodCode ? { periodCode:row.periodCode } : {}),
          }} />
        </div>}
      </div>;
    })}
  </div>;
}

export function SubsidiaryBalancesPanel({ account, enabled, viewer, refreshKey = 0 }: SubsidiaryBalancesPanelProps) {
  const { scope } = useLedgerBookScope();
  const { isSqlActive, serverVersion } = useDataSyncStatus();
  const key = JSON.stringify([viewer, scope, refreshKey, serverVersion]);
  const { data: result, loading, error, refetch } = useDataQuery(async provider => enabled
    ? { key, data:await provider.getDetailSubsidiaryBalances(scope) } : null, [enabled,key]);
  if (!enabled) return null;
  const data = result?.key===key ? result.data : null;
  const view = error ? ({ kind: 'UNAVAILABLE' } as const) : data ? resolveCustomerBalanceView(data, account) : ({ kind: 'LOADING' } as const);

  return (
    <Card padding="md" className="space-y-2 rounded-xl border border-border" data-testid="subsidiary-balances">
      <span className="block text-xs font-bold text-text-main">مانده تفکیکی به‌ازای معین</span>
      {isSqlActive && <LedgerBookSourceSelect viewer={viewer} />}
      {(loading || view.kind === 'LOADING') && <div className="h-16 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}
      {view.kind === 'UNAVAILABLE' && <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-text-secondary">
        <p>منبع مانده در دسترس نیست.{('reason' in view && view.reason) ? ` (${view.reason})` : ''}</p>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void refetch()}>تلاش مجدد</Button>
      </div>}
      {view.kind === 'NO_LEDGER' && <p className="py-2 text-xs text-text-secondary">برای این مشتری گردش دفتر کل ثبت نشده است.</p>}
      {view.kind === 'OK' && (
        <>
          <SubsidiaryBalanceDetails detailKey={view.detailKey} rows={view.subsidiaries} />
          <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
            <span className="text-text-secondary">جمع تفصیلی (تجمیع معین‌ها){view.incomplete ? ' · پوشش یا نگاشت تأیید نشده' : ''}</span>
            <span className={cn('font-mono font-bold tabular-nums', NATURE_CLS[balanceNature(view.total)])}>{formatCurrency(Math.abs(view.total))} ریال · {NATURE_LABEL[balanceNature(view.total)]}</span>
          </div>
        </>
      )}
    </Card>
  );
}
