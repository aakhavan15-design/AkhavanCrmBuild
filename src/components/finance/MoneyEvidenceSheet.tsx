import { useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount, formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import type { MoneyEvidenceFilter, MoneyInventoryPosition, MoneyPeriod } from '../../services/moneyIntelligence';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/LoadingState';
import { FifoLayerDialog } from './FifoInventoryPanel';

export type MoneyEvidenceSelection = Omit<MoneyEvidenceFilter, 'page' | 'search'> & { title: string };
const issueLabels: Record<string, string> = {
  CURRENCY: 'ارز خارج از مبنای ریال', STATUS: 'وضعیت بدون نگاشت', NUMBER: 'بدون شمارهٔ معتبر',
  LINES: 'بدون ردیف', UNBALANCED: 'سند نامتوازن', MAPPING: 'کدینگ ناقص یا مبهم', CLOSING_CASH: 'گردش نقدی در سند بستن حساب‌ها',
};

export function MoneyEvidenceSheet({ selection, period, onClose, onSelect }: {
  selection: MoneyEvidenceSelection;
  period: MoneyPeriod;
  onClose: () => void;
  onSelect: (selection: MoneyEvidenceSelection) => void;
}) {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [fifoRun, setFifoRun] = useState<MoneyInventoryPosition | null>(null);
  const requestKey = JSON.stringify([period, selection.mode, selection.key, selection.detail, page, search]);
  const { data, loading, error, refetch } = useDataQuery(async provider => ({
    requestKey,
    result: await provider.getMoneyEvidence(period, { mode: selection.mode, key: selection.key, selection.detail, page, search }),
  }), [requestKey]);
  const result = data?.requestKey === requestKey ? data.result : null;
  const fifo = selection.mode === 'fifo';
  const accounts = selection.mode === 'cash-accounts';
  const showBank = selection.mode === 'bank';

  if (fifoRun) return <FifoLayerDialog run={fifoRun} onClose={() => setFifoRun(null)} />;
  return (
    <BottomSheet isOpen onClose={onClose} title={selection.title} subtitle={showBank ? 'کنترل‌های ثبت‌شدهٔ تطبیق بانکی' : accounts ? 'گردش هر حساب شامل انتقال داخلی آن حساب است' : 'ریز اسناد و ردیف‌های منبع'} footer={!showBank &&
      <nav className="flex w-full flex-wrap items-center justify-between gap-2" aria-label="صفحه‌بندی اسناد">
        <Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>قبلی</Button>
        <span className="text-caption">صفحهٔ {formatCount(page)}</span>
        <Button type="button" variant="outline" disabled={!result?.hasMore || loading} onClick={() => setPage(page + 1)}>بعدی</Button>
      </nav>
    }>
      {selection.mode === 'cash-account' && <Button type="button" size="sm" variant="ghost"
        onClick={() => onSelect({ title: 'حساب‌های نقدی و بانکی', mode: 'cash-accounts' })}>بازگشت به حساب‌ها</Button>}
      {!showBank && <form className="mb-3 flex items-end gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(draft.trim()); }}>
        <div className="min-w-0 flex-1">
          <Input label={fifo ? 'شناسهٔ کالا یا انبار' : accounts ? 'نام حساب یا کد معین و تفصیلی' : 'شمارهٔ سند، فاکتور یا کد حساب'}
            type="search" maxLength={100} value={draft} onChange={event => setDraft(event.target.value)} />
        </div>
        <Button type="submit" variant="outline">جست‌وجو</Button>
      </form>}
      {loading ? <LoadingState label="در حال دریافت ریز اسناد" /> : error ? (
        <EmptyState surface="finance_money_evidence" title="دریافت ریز اسناد ممکن نیست" actionLabel="تلاش دوباره" onAction={() => void refetch()} />
      ) : !result?.items.length ? (
        <EmptyState surface="finance_money_evidence" title="ردیف منطبق با این فیلتر یافت نشد" compact />
      ) : <ul className="divide-y divide-border">
        {result.items.map(row => 'runId' in row ? (
          <li key={`${row.runId}-${row.warehouseId}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0 space-y-1 text-caption">
              <p className="wrap-break-word font-bold">کالا <bdi>{row.productId}</bdi> · انبار <bdi>{row.warehouseId}</bdi></p>
              <p>ارزش {formatDecimalString(row.amount)} ریال · مقدار {formatDecimalString(row.quantity)} <bdi>{row.unitCode}</bdi></p>
              <p className="wrap-break-word text-text-secondary">تاریخ ارزش‌گذاری {formatAppDate(row.date)} · مرجع <bdi>{row.sourceProof}</bdi></p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setFifoRun(row)}>لایه‌ها و اسناد</Button>
          </li>
        ) : 'periodDebit' in row ? (
          <li key={JSON.stringify([row.accountCode,row.detailCode])} className="py-2">
            <button type="button" className="min-h-11 w-full rounded-lg p-2 text-start hover:bg-hover" onClick={() => onSelect({
              title: row.partyTitle || row.accountTitle || 'گردش حساب نقدی',
              mode: 'cash-account', key: row.accountCode, detail: row.detailCode ?? '',
            })}>
              <span className="block font-bold wrap-break-word">{row.partyTitle || row.accountTitle || 'حساب نقدی'}</span>
              <span className="block text-caption text-text-secondary">معین <bdi>{row.accountCode}</bdi>{row.detailCode && <> · تفصیلی <bdi>{row.detailCode}</bdi></>}</span>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-caption tabular-nums">
                <div><dt>ابتدای دوره</dt><dd>{formatDecimalString(row.opening)}</dd></div>
                <div><dt>پایان دوره</dt><dd>{formatDecimalString(row.closing)}</dd></div>
                <div><dt>گردش بدهکار</dt><dd>{formatDecimalString(row.periodDebit)}</dd></div>
                <div><dt>گردش بستانکار</dt><dd>{formatDecimalString(row.periodCredit)}</dd></div>
              </dl>
            </button>
          </li>
        ) : 'controlId' in row ? (
          <li key={row.controlId} className="space-y-1 py-3 text-caption">
            <p className="font-bold">{row.metric === 'BANK_CLOSING_IRR' ? 'ماندهٔ اعلام‌شدهٔ بانک' : 'مبلغ ناخالص اسناد تطبیق‌نشده'}</p>
            <p>مبلغ منبع {formatDecimalString(row.amount)} ریال · مبلغ مقایسه {formatDecimalString(row.comparisonAmount)} ریال</p>
            <p>{row.result === 'MATCHED' ? 'منطبق' : row.result === 'MISMATCH' ? 'دارای اختلاف' : 'نامشخص'}</p>
            <p className="wrap-break-word text-text-secondary">ورود داده <bdi>{row.batchId}</bdi> · کنترل <bdi>{row.controlId}</bdi> · {formatAppDate(row.finishedAt)}</p>
          </li>
        ) : (
          <li key={row.lineId ?? row.journalId} className="grid gap-2 py-3 text-caption sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-1 wrap-break-word">
              <p className="font-bold">سند <bdi>{row.documentNumber || row.externalJournalId}</bdi> · {formatAppDate(row.date)}</p>
              <p className="text-text-secondary">شناسهٔ ERP <bdi>{row.externalJournalId}</bdi></p>
              {row.issue && <p className="text-warning">{issueLabels[row.issue] ?? 'نیازمند بررسی'}</p>}
              {row.accountCode && <p>{row.accountTitle || 'حساب'} <bdi>{row.accountCode}</bdi>
                {row.detailCode && <> · تفصیلی <bdi>{row.detailCode}</bdi></>}
                {row.partyTitle && <> · {row.partyTitle}</>}</p>}
              {(row.categoryTitle || row.centerTitle) && <p className="text-text-secondary">{[row.categoryTitle, row.centerTitle].filter(Boolean).join(' · ')}</p>}
              {row.refId && <p className="text-text-secondary">مرجع سند <bdi>{row.refId}</bdi>
                {row.refType && <> · <bdi>{row.refType}</bdi></>}</p>}
            </div>
            {row.lineId && <dl className="flex flex-wrap gap-3 tabular-nums">
              <div><dt className="text-text-secondary">بدهکار</dt><dd>{formatDecimalString(row.debit)}</dd></div>
              <div><dt className="text-text-secondary">بستانکار</dt><dd>{formatDecimalString(row.credit)}</dd></div>
            </dl>}
          </li>
        ))}
      </ul>}
    </BottomSheet>
  );
}
