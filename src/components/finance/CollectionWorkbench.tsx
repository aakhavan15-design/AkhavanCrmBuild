import { useState } from 'react';
import type { Account, AppState } from '../../types';
import type { CollectionPromiseRecord, CustomerCollectionProfile, RiskLevel } from '../../services/collectionEngine';
import type { LedgerAgingCustomer } from '../../services/agingBuckets';
import type { CollectionActionInput } from '../../services/dataProvider';
import { getActiveDataProvider } from '../../services/dataProvider';
import { resolveCustomerBalanceView, type DetailBalancesResult } from '../../lib/receivableReconciliation';
import { pareto } from '../../lib/reportAnalytics';
import { formatCount, formatMoney, formatNumber } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import type { FilterGroup } from '../../lib/tableEngine';
import { DataTable, DetailField, DetailGroup, type DataTableColumn } from '../ui/DataTable';
import { SubsidiaryBalanceDetails } from '../shared/SubsidiaryBalancesPanel';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CollectionReceiptSheet } from './CollectionReceiptSheet';
import { BatchCollectionFollowUp } from './BatchCollectionFollowUp';

const riskLabels: Record<RiskLevel, string> = { LOW: 'کم', MEDIUM: 'متوسط', HIGH: 'زیاد', CRITICAL: 'بحرانی' };
const unknown = 'نامشخص';

interface CollectionRow {
  profile: CustomerCollectionProfile;
  ownerId: string;
  ownerName: string;
  accountCode?: string;
  balance: ReturnType<typeof resolveCustomerBalanceView>;
  estimatedOverdue: number | null;
  maxDays: number | null;
  risk: RiskLevel | 'UNKNOWN';
  overduePromise: boolean;
}

const getRowId = (row: CollectionRow) => row.profile.accountId;
const columns: DataTableColumn<CollectionRow>[] = [
  { id: 'account', header: 'مشتری', value: row => row.profile.accountName, primary: true },
  { id: 'owner', header: 'مالک حساب', value: row => row.ownerName, mobile: 'hide' },
  { id: 'overdue', header: 'معوق تخمینی (ریال)', value: row => row.estimatedOverdue,
    render: row => row.estimatedOverdue === null ? unknown : formatNumber(row.estimatedOverdue) },
  { id: 'days', header: 'بیشترین تأخیر (روز)', value: row => row.maxDays,
    render: row => row.maxDays === null ? unknown : formatCount(row.maxDays), mobile: 'hide' },
  { id: 'risk', header: 'ریسک برآوردی', value: row => row.risk === 'UNKNOWN' ? null : row.profile.riskScore,
    render: row => row.risk === 'UNKNOWN' ? unknown : riskLabels[row.risk],
    exportValue: row => row.risk === 'UNKNOWN' ? null : riskLabels[row.risk] },
  { id: 'promises', header: 'تعهد باز', value: row => row.profile.activePromises.length,
    render: row => row.overduePromise ? 'سررسید گذشته، بررسی نیاز دارد' : formatCount(row.profile.activePromises.length) },
];

interface Props {
  state: AppState;
  accounts: readonly Account[];
  profiles: readonly CustomerCollectionProfile[];
  balances: DetailBalancesResult | null;
  aging: readonly LedgerAgingCustomer[];
  today: string;
  loading: boolean;
  onRetry: () => void;
  canPromise: (accountId: string) => boolean;
  canFollowUp: boolean;
  assignees: ReadonlyArray<{ id: string; name: string }>;
  onAction: (kind: CollectionActionInput['kind'], profile: CustomerCollectionProfile) => void;
  onNotice: (message: string) => void;
}

export function CollectionWorkbench({ state, accounts, profiles, balances, aging, today, loading, onRetry,
  canPromise, canFollowUp, assignees, onAction, onNotice }: Props) {
  const [receipt, setReceipt] = useState<CollectionPromiseRecord | null>(null);
  const closedByAccount = new Map<string, CollectionPromiseRecord[]>();
  const promises = (state as unknown as { collectionPromises?: CollectionPromiseRecord[] }).collectionPromises || [];
  for (const promise of promises) if (promise.status === 'FULFILLED' && promise.receiptEvidence) {
    const rows = closedByAccount.get(promise.accountId) || [];
    rows.push(promise);
    closedByAccount.set(promise.accountId, rows);
  }
  const [batch, setBatch] = useState<CollectionRow[] | null>(null);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const agingById = new Map(aging.map(row => [row.id, row]));
  const names = new Map(state.users.map(user => [user.id, user.name]));
  const verifiedByRecorder = new Map<string, Set<string>>();
  if (getActiveDataProvider().name === 'SQLSERVER_BACKEND') for (const [accountId, verified] of closedByAccount) {
    if (!accountsById.has(accountId)) continue;
    for (const promise of verified) {
      const recorder = promise.receiptEvidence?.matchedBy;
      if (!recorder || !promise.receiptEvidence?.matchedAt) continue;
      const receipts = verifiedByRecorder.get(recorder) ?? new Set<string>();
      receipts.add(promise.receiptEvidence.id);
      verifiedByRecorder.set(recorder, receipts);
    }
  }
  const rows = profiles.flatMap((profile): CollectionRow[] => {
    const account = accountsById.get(profile.accountId);
    if (!account) return [];
    const balance = resolveCustomerBalanceView(balances, account);
    const coverage = agingById.get(account.id);
    const sufficientlyMapped = balance.kind === 'OK' && !balance.incomplete
      && (balance.total <= 0 || (coverage && coverage.unattributed === 0));
    return [{
      profile, balance, accountCode: account.code, ownerId: account.ownerId || '',
      ownerName: names.get(account.ownerId || '') || 'تعیین نشده',
      estimatedOverdue: sufficientlyMapped ? profile.overdueBalance : null,
      maxDays: sufficientlyMapped ? profile.maxDaysOverdue : null,
      risk: sufficientlyMapped ? profile.riskLevel : 'UNKNOWN',
      overduePromise: profile.activePromises.some(promise => promise.promisedDate && promise.promisedDate < today),
    }];
  });
  const owners = new Map(rows.map(row => [row.ownerId, row.ownerName]));
  const detailFrequency=new Map<string,number>();
  for (const row of rows) if (row.balance.kind==='OK') {
    detailFrequency.set(row.balance.detailKey,(detailFrequency.get(row.balance.detailKey) ?? 0)+1);
  }
  const scopedLedger=balances?.source==='SQLSERVER_BACKEND' && balances.status==='LIVE' && balances.currency==='IRR' && Boolean(balances.sourceSystem);
  const comparable=scopedLedger ? rows.filter(row=>row.balance.kind==='OK' && !row.balance.incomplete &&
    Number.isFinite(row.balance.total) && Math.abs(row.balance.total)<=Number.MAX_SAFE_INTEGER && detailFrequency.get(row.balance.detailKey)===1) : [];
  const concentration=pareto(comparable.flatMap(row=>row.balance.kind==='OK' && row.balance.total>0
    ? [{key:row.profile.accountId,value:row.balance.total,row}] : []));
  const largestDebtors=concentration.rows.slice(0,5);
  const percentage=new Intl.NumberFormat('fa-IR',{style:'percent',maximumFractionDigits:1});
  const filters: FilterGroup<CollectionRow>[] = [
    { id: 'risk', label: 'ریسک', options: [
      ...Object.entries(riskLabels).map(([value, label]) => ({ value, label })),
      { value: 'UNKNOWN', label: unknown },
    ], predicate: (row, value) => row.risk === value },
    { id: 'owner', label: 'مالک حساب',
      options: [...owners].map(([value, label]) => ({ value: value || 'unassigned', label })),
      predicate: (row, value) => (row.ownerId || 'unassigned') === value },
    { id: 'followUp', label: 'نیاز به پیگیری', options: [
      { value: 'overdue', label: 'مطالبهٔ معوق' },
      { value: 'promise', label: 'تعهد باز' },
      { value: 'late', label: 'تعهد سررسید گذشته' },
    ], predicate: (row, value) => value === 'overdue' ? (row.estimatedOverdue ?? 0) > 0
      : value === 'late' ? row.overduePromise : row.profile.activePromises.length > 0 },
  ];

  return <>
    {balances?.status === 'UNAVAILABLE' && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm">
      <span>دریافت ماندهٔ دفتر کل ممکن نیست. مانده و ریسک نامشخص نمایش داده می‌شوند.</span>
      <Button type="button" variant="outline" onClick={onRetry}>دریافت دوباره</Button>
    </div>}
    {largestDebtors.length>0 && <Card padding="sm" className="space-y-2">
      <div>
        <h3 className="text-sm font-bold">تمرکز ماندهٔ بدهکار</h3>
        <p className="text-caption text-text-secondary">
          {formatCount(largestDebtors.length)} مشتری اول، {percentage.format(largestDebtors.at(-1)?.cumulativeShare ?? 0)} از ماندهٔ بدهکارِ مشتریان قابل مقایسهٔ این کارتابل را دارند.
          {rows.length>comparable.length && <> {formatCount(rows.length-comparable.length)} حساب با ماندهٔ نامشخص، ناقص یا تفصیلی مشترک در مقایسه لحاظ نشده است.</>}
          {balances?.asOf && <> · تا {formatAppDate(balances.asOf,state.settings?.locale)}</>}
        </p>
      </div>
      <ul className="divide-y divide-border">{largestDebtors.map(item=><li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-caption">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{item.row.profile.accountName} · {formatMoney(item.value)}</p>
          <p className="text-text-secondary">{item.row.ownerName}{item.row.overduePromise && ' · تعهد سررسیدگذشته نیازمند بررسی'}</p>
          <progress value={item.share} max={1} className="w-full accent-primary" aria-label={`سهم ${item.row.profile.accountName} از ماندهٔ بدهکار قابل مقایسه`} />
        </div>
        {canFollowUp && <Button type="button" size="sm" variant="ghost" onClick={()=>onAction('FOLLOW_UP',item.row.profile)}>پیگیری</Button>}
      </li>)}</ul>
    </Card>}
    {verifiedByRecorder.size > 0 && <details className="rounded-xl border border-border bg-surface p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">نتیجهٔ تطبیق وصول به تفکیک ثبت‌کننده</summary>
      <p className="text-caption text-text-secondary">شمار رسیدهای یکتای ERP که در آخرین دریافت سرور همچنان با تعهدهای قابل مشاهده منطبق‌اند.</p>
      <ul className="divide-y divide-border text-caption">
        {[...verifiedByRecorder].sort((a,b) => b[1].size - a[1].size).map(([id, receipts]) =>
          <li key={id} className="flex justify-between gap-2 py-2"><span>{names.get(id) ?? 'ثبت‌کنندهٔ نامشخص'}</span><strong>{formatCount(receipts.size)} رسید منطبق</strong></li>)}
      </ul>
    </details>}
    <DataTable tableId="collection-workbench" savedFiltersScope={state.currentUserId || undefined}
      title="کارتابل وصول مطالبات" subtitle="مبنای مانده دفتر کل است. معوق و ریسک، برآورد پیگیری‌اند."
      rows={rows} getRowId={getRowId} columns={columns} filterGroups={filters}
      searchPlaceholder="نام یا کد مشتری، یا مالک حساب" extraSearchText={row => [row.accountCode]}
      defaultSort={{ columnId: 'risk', direction: 'desc' }} loading={loading && !balances}
      exportFileName="collection_workbench" emptyTitle="پروندهٔ وصولی در این نما دیده نمی‌شود"
      emptyDescription="عبارت جست‌وجو یا فیلترها را تغییر دهید."
      bulkActions={canFollowUp ? [{ id: 'follow-up', label: 'ایجاد پیگیری برای انتخاب‌شده‌ها',
        enabled: selection => selection.length <= 20, disabledReason: 'حداکثر بیست مشتری را انتخاب کنید.',
        run: setBatch }] : []}
      detailTitle={row => row.profile.accountName}
      renderDetail={row => <>
        <DetailGroup title="ماندهٔ تفصیلی، معین و دوره">
          {row.balance.kind === 'OK' ? <>
            {row.balance.incomplete && <p role="status" className="text-caption text-warning">بخشی از گردش فاقد نگاشت معین است.</p>}
            <DetailField label="تفصیلی"><bdi>{row.balance.detailKey}</bdi></DetailField>
            <SubsidiaryBalanceDetails detailKey={row.balance.detailKey} rows={row.balance.subsidiaries}
              byPeriod locale={state.settings?.locale} />
          </> : <p className="text-caption text-text-secondary">ماندهٔ قابل استناد برای این حساب در دسترس نیست.</p>}
        </DetailGroup>
        <DetailGroup title="تعهدهای باز مشتری">
          {!row.profile.activePromises.length ? <p className="text-caption text-text-secondary">تعهد بازی ثبت نشده است.</p>
            : <ul className="space-y-2">{row.profile.activePromises.map(promise => <li key={promise.id} className="rounded-lg bg-canvas p-2 text-caption">
              <p className="font-semibold">{formatMoney(promise.promisedAmount)} · {formatAppDate(promise.promisedDate, state.settings?.locale)}</p>
              <p className="text-text-secondary">{promise.receiptEvidence ? 'نیازمند راستی‌آزمایی مجدد سند'
                : promise.promisedDate < today ? 'سررسید گذشته؛ نیازمند بررسی' : 'در انتظار پیگیری'}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReceipt(promise)}>بررسی سند ERP</Button>
            </li>)}</ul>}
        </DetailGroup>
        {(closedByAccount.get(row.profile.accountId) || []).length > 0 && <DetailGroup title="تعهدهای دارای مدرک ERP">
          <ul className="space-y-2">{closedByAccount.get(row.profile.accountId)?.map(promise => <li key={promise.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas p-2 text-caption">
            <strong>{formatMoney(promise.promisedAmount)} · {formatAppDate(promise.promisedDate, state.settings?.locale)}</strong>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReceipt(promise)}>مشاهدهٔ مدرک</Button>
          </li>)}</ul>
        </DetailGroup>}

      </>}
      detailFooter={row => <div className="flex flex-wrap gap-2">
        {canPromise(row.profile.accountId) && <Button variant="soft" onClick={() => onAction('PROMISE', row.profile)}>ثبت تعهد</Button>}
        {canFollowUp && <Button variant="outline" onClick={() => onAction('FOLLOW_UP', row.profile)}>پیگیری در تقویم</Button>}
      </div>}
    />
    {receipt && <CollectionReceiptSheet key={receipt.id} promise={receipt}
      locale={state.settings?.locale} canEdit={canPromise(receipt.accountId)}
      onClose={() => setReceipt(null)}
      onRecorded={() => { onNotice('سند ERP ثبت و تعهد بسته شد. وضعیت واریز بانکی جداگانه بررسی می‌شود.'); setReceipt(null); }} />}
    {batch && <BatchCollectionFollowUp
      accounts={batch.map(row => ({ id: row.profile.accountId, name: row.profile.accountName }))}
      assignees={assignees} currentUserId={state.currentUserId || ''}
      onClose={() => setBatch(null)} onComplete={message => { onNotice(message); setBatch(null); }} />}
  </>;
}
