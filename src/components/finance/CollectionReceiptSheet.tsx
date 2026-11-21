import { useId, useRef, useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount, formatDecimalString, formatMoney } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import type { CollectionPromiseRecord } from '../../services/collectionEngine';
import { getActiveDataProvider, type CollectionReceiptDocument } from '../../services/dataProvider';
import { getStateSyncEngine } from '../../services/stateSyncRuntime';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { ErrorState, LoadingState } from '../ui';

interface Props {
  promise: CollectionPromiseRecord;
  locale?: unknown;
  canEdit: boolean;
  onClose: () => void;
  onRecorded: () => void;
}

function ReceiptDetails({ payment, locale }: { payment: CollectionReceiptDocument; locale?: unknown }) {
  return <div className="min-w-0 space-y-1">
    <p className="wrap-break-word font-semibold text-text-main">مرجع <bdi>{payment.reference}</bdi></p>
    <p className="wrap-break-word text-text-secondary">{formatAppDate(payment.date, locale)} · {formatDecimalString(payment.amount)} ریال</p>
    <p className="wrap-break-word text-caption text-text-secondary">سند <bdi>{payment.externalId}</bdi> · سامانه <bdi>{payment.source}</bdi></p>
  </div>;
}

export function CollectionReceiptSheet({ promise, locale, canEdit, onClose, onRecorded }: Props) {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const radioName = useId();
  const query = useDataQuery(provider => provider.getCollectionReceiptEvidence(promise.id, page), [promise.id, page]);
  const pageData = query.data?.promiseId === promise.id && query.data?.page === page ? query.data : null;
  const selected = !query.loading && !query.error && pageData?.items.find(item => item.id === selectedId);

  const submit = async () => {
    if (!canEdit || !selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await getActiveDataProvider().linkCollectionReceipt(promise.id, selected.id);
      void getStateSyncEngine()?.hydrate().catch(() => {});
      onRecorded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت مدرک تأیید نشد.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const dismiss = () => { if (!lock.current) onClose(); };
  return <BottomSheet isOpen onClose={dismiss} title="مدرک وصول تعهد" subtitle={promise.accountName}
    footer={<div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="ghost" onClick={dismiss} disabled={busy}>بستن</Button>
      {canEdit && !pageData?.current && <Button type="button" disabled={!selected || busy} onClick={() => void submit()}>
        {busy ? 'در حال ثبت…' : 'ثبت سند و بستن تعهد'}
      </Button>}
    </div>}>
    <div className="space-y-3 text-sm">
      <p><strong>مبلغ تعهد {formatMoney(promise.promisedAmount)}</strong> · {formatAppDate(promise.promisedDate, locale)}</p>
      <p className="text-text-secondary">فقط دریافتی نهایی همان مشتری با مبلغ یکسان نمایش داده می‌شود. این تطبیق، اثر بانکی یا تسویهٔ فاکتور را تأیید نمی‌کند.</p>
      {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-danger">{error}</p>}
      {!query.loading && pageData && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void query.refetch()}>بازخوانی وضعیت سند</Button>}
      {pageData?.invalidated && <p role="status" className="rounded-xl bg-warning-soft p-3 text-warning">سند قبلی اکنون معتبر نیست. برای بستن تعهد سند معتبر دیگری انتخاب کنید.</p>}
      {query.error ? <ErrorState surface="collection_receipt" title="دریافت دریافتی‌های ERP ممکن نیست"
        description={query.error.message} onRetry={() => void query.refetch()} />
        : query.loading || !pageData ? <LoadingState label="در حال خواندن اسناد ERP" />
        : pageData.current ? <section className="space-y-2 rounded-xl border border-border bg-canvas p-3" aria-label="سند متصل به تعهد">
          <h3 className="font-semibold text-success">مدرک ERP معتبر است</h3>
          <ReceiptDetails payment={pageData.current} locale={locale} />
          <p className="text-caption text-text-secondary">تاریخ دریافت سند از ERP {formatAppDate(pageData.current.syncedAt, locale)}</p>
        </section> : <>
          {pageData.items.length ? <fieldset className="space-y-2" disabled={busy || !canEdit}>
            <legend className="mb-2 font-semibold">دریافتی‌های قابل تطبیق</legend>
            {pageData.items.map(item => <label key={item.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-border p-3 hover:bg-canvas">
              <input type="radio" name={radioName} checked={selectedId === item.id} onChange={() => setSelectedId(item.id)} />
              <ReceiptDetails payment={item} locale={locale} />
            </label>)}
          </fieldset> : <p role="status" className="text-text-secondary">در این صفحه دریافتی منطبق یافت نشد.</p>}
          {(page > 1 || pageData.hasMore) && <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={page <= 1 || busy} onClick={() => { setSelectedId(''); setPage(page - 1); }}>قبلی</Button>
            <span>صفحهٔ {formatCount(page)}</span>
            <Button type="button" variant="ghost" disabled={!pageData.hasMore || busy} onClick={() => { setSelectedId(''); setPage(page + 1); }}>بعدی</Button>
          </div>}
        </>}
    </div>
  </BottomSheet>;
}
