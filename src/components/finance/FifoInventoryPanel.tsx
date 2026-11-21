import { useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { useDataSyncStatus } from '../../services/dataSyncController';
import { toPersianDigits } from '../../lib/digits';
import { formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import type { FifoValuationRow } from '../../services/dataProvider';

const layerKindLabels: Record<string, string> = {
  OPENING: 'افتتاحیه', RECEIPT: 'رسید انبار', ADJUSTMENT_IN: 'اصلاح افزایشی',
  SALE_RETURN: 'برگشت فروش', TRANSFER: 'انتقال بین انبارها', SALE: 'فروش',
  PURCHASE_RETURN: 'برگشت خرید', ISSUE: 'حوالهٔ خروج', ADJUSTMENT_OUT: 'اصلاح کاهشی',
};

export function FifoInventoryPanel({ userId, locale }: {
  userId?: string | null;
  locale?: Parameters<typeof formatAppDate>[1];
}) {
  const { serverVersion } = useDataSyncStatus();
  const { data, loading, error, refetch } = useDataQuery(provider => provider.getFifoValuations(), [userId, serverVersion]);
  const [selected, setSelected] = useState<FifoValuationRow | null>(null);

  return (
    <Card role="region" aria-label="ارزش‌گذاری تحلیلی موجودی" className="space-y-3">
      <header>
        <h2 className="font-semibold text-text-main">ارزش‌گذاری تحلیلی موجودی</h2>
        <p className="mt-1 text-xs text-text-secondary">مقدار و بهای تحلیلی هر انبار بر مبنای لایه‌های منتشرشدهٔ اولین ورود، اولین خروج نمایش داده می‌شود.</p>
      </header>
      {loading ? <p role="status" className="text-sm text-text-secondary">در حال دریافت لایه‌های منتشرشده…</p>
        : data?.status === 'RESTRICTED' ? <p role="status" className="text-sm text-text-secondary">مجوز مشاهدهٔ ارزش‌گذاری سازمانی را ندارید.</p>
        : error || !result || result.status === 'UNAVAILABLE' ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span>منبع ارزش‌گذاری در دسترس نیست.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>بازخوانی ارزش‌گذاری</Button>
          </div>
        ) : data.status === 'EMPTY' ? <p role="status" className="text-sm text-text-secondary">ارزش‌گذاری منتشرشده‌ای برای نمایش وجود ندارد.</p> : (
          <>
            <ul className="divide-y divide-border">
              {data.items.map(item => (
                <li key={`${item.runId}:${item.warehouseId}`} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-1 text-xs text-text-secondary">
                    <p className="wrap-break-word font-semibold text-text-main">کالا <bdi>{item.productId}</bdi> · انبار <bdi>{item.warehouseId}</bdi></p>
                    <p>پوشش از {formatAppDate(item.periodStart, locale)} تا {formatAppDate(item.through, locale)}</p>
                    <p>سامانهٔ مبدأ <bdi>{item.sourceSystemCode}</bdi></p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelected(item)}
                      aria-label={`ریز لایه‌های کالا ${item.productId} در انبار ${item.warehouseId}`}>ریز لایه‌ها</Button>
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <div><dt>مقدار</dt><dd className="wrap-break-word tabular-nums text-text-main">{formatDecimalString(item.quantity)} <bdi>{item.unitCode}</bdi></dd></div>
                    <div><dt>ارزش تحلیلی</dt><dd className="wrap-break-word tabular-nums text-text-main">{formatDecimalString(item.amount)} {item.currencyCode === 'IRR' ? 'ریال' : <bdi>{item.currencyCode}</bdi>}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
            {data.hasMore && <p className="text-xs text-text-secondary">فقط آخرین {toPersianDigits(data.items.length)} نتیجه نمایش داده شده است.</p>}
          </>
        )}
      {selected && <FifoLayerDialog run={selected} locale={locale} onClose={() => setSelected(null)} />}
    </Card>
  );
}

export function FifoLayerDialog({ run, locale, onClose }: {
  run: Pick<FifoValuationRow, 'runId' | 'warehouseId' | 'productId'>;
  locale?: Parameters<typeof formatAppDate>[1];
  onClose: () => void;
}) {
  const [pages, setPages] = useState([0]);
  const [activity, setActivity] = useState<'inbound' | 'withdrawals'>('inbound');
  const after = pages.at(-1) ?? 0;
  const { data, loading, error, refetch } = useDataQuery(
    async provider => ({ activity, after, page: await provider.getFifoLayers(run.runId, run.warehouseId, after, activity) }),
    [run.runId, run.warehouseId, after, activity],
  );
  const result = data?.activity === activity && data.after === after ? data.page : null;
  const next = result?.next ?? null;

  return (
    <Modal isOpen onClose={onClose} title="ریز گردش و لایه‌های موجودی" subtitle={`کالا ${run.productId} · انبار ${run.warehouseId}`} size="xl"
      footer={<nav aria-label="صفحه‌بندی ریز لایه‌ها" className="flex w-full flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" disabled={loading || pages.length <= 1}
          onClick={() => setPages(current => current.slice(0, -1))}>صفحهٔ قبل</Button>
        <span className="text-xs text-text-secondary">صفحهٔ {toPersianDigits(pages.length)}</span>
        <Button type="button" variant="outline" disabled={loading || next === null}
          onClick={() => { if (next !== null) setPages(current => [...current, next]); }}>صفحهٔ بعد</Button>
      </nav>}>
      <div role="group" aria-label="نوع گردش موجودی" className="mb-2 flex flex-wrap gap-1">
        <Button type="button" size="sm" variant={activity === 'inbound' ? 'soft' : 'ghost'} aria-pressed={activity === 'inbound'}
          onClick={() => { setActivity('inbound'); setPages([0]); }}>ورود و لایه‌ها</Button>
        <Button type="button" size="sm" variant={activity === 'withdrawals' ? 'soft' : 'ghost'} aria-pressed={activity === 'withdrawals'}
          onClick={() => { setActivity('withdrawals'); setPages([0]); }}>خروج و مصرف لایه‌ها</Button>
      </div>
      {loading || (data && !result && !error) ? <p role="status">در حال دریافت ریز گردش…</p>
        : result?.status === 'RESTRICTED' ? <p role="status">مجوز مشاهدهٔ ریز لایه‌ها را ندارید.</p>
        : error || !result || result.status === 'UNAVAILABLE' ? <div role="alert" className="space-y-2">
          <p>دریافت ریز لایه‌ها انجام نشد.</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>تلاش مجدد</Button>
        </div> : result.status === 'EMPTY' ? <p role="status">گردشی از این نوع در این محدوده ثبت نشده است.</p> : (
          <ul className="divide-y divide-border">
            {result.items.map(layer => (
              <li key={layer.consumptionNo ?? layer.layerNo} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0 space-y-1 text-xs text-text-secondary">
                  <p className="font-semibold text-text-main">لایهٔ {toPersianDigits(layer.layerNo)} · {layerKindLabels[layer.kind] ?? 'نوع نامشخص'}</p>
                  <p className="wrap-break-word">سند <bdi>{layer.documentId}</bdi> · ردیف <bdi>{layer.lineId}</bdi></p>
                  <p>{formatAppDate(layer.effectiveAt, locale)}{layer.originConsumptionNo == null ? '' : ` · برداشت مرجع ${toPersianDigits(layer.originConsumptionNo)}`}</p>
                  {layer.layerDocumentId && <p className="wrap-break-word">سند لایهٔ مبدأ <bdi>{layer.layerDocumentId}</bdi></p>}
                </div>
                <dl className="grid grid-cols-3 gap-3 text-xs text-text-secondary">
                  <div><dt>{layer.consumptionNo ? 'مقدار برداشت' : 'مقدار اولیه'}</dt><dd className="tabular-nums text-text-main">{formatDecimalString(layer.quantity)}</dd></div>
                  <div><dt>{layer.consumptionNo ? 'مقدار برگشت' : 'ماندهٔ لایه'}</dt><dd className="tabular-nums text-text-main">{formatDecimalString(layer.consumptionNo ? layer.returned : layer.remaining)}</dd></div>
                  <div><dt>{layer.consumptionNo ? 'بهای برداشت' : 'بهای واحد'}</dt><dd className="tabular-nums text-text-main">{formatDecimalString(layer.consumptionNo ? layer.totalCost : layer.unitCost)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
    </Modal>
  );
}
