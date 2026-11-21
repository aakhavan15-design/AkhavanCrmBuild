import { useDataQuery } from '../../hooks/useDataProvider';
import { useDataSyncStatus } from '../../services/dataSyncController';
import { toPersianDigits } from '../../lib/digits';
import { formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export function FifoInventoryPanel({ userId, locale }: {
  userId?: string | null;
  locale?: Parameters<typeof formatAppDate>[1];
}) {
  const { serverVersion } = useDataSyncStatus();
  const { data, loading, error, refetch } = useDataQuery(provider => provider.getFifoValuations(), [userId, serverVersion]);

  return (
    <Card role="region" aria-label="ارزش‌گذاری تحلیلی موجودی" className="space-y-3">
      <header>
        <h2 className="font-semibold text-text-main">ارزش‌گذاری تحلیلی موجودی</h2>
        <p className="mt-1 text-xs text-text-secondary">مقدار و بهای تحلیلی هر انبار بر مبنای لایه‌های منتشرشدهٔ اولین ورود، اولین خروج نمایش داده می‌شود.</p>
      </header>
      {loading ? <p role="status" className="text-sm text-text-secondary">در حال دریافت لایه‌های منتشرشده…</p>
        : data?.status === 'RESTRICTED' ? <p role="status" className="text-sm text-text-secondary">مجوز مشاهدهٔ ارزش‌گذاری سازمانی را ندارید.</p>
        : error || !data || data.status === 'UNAVAILABLE' ? (
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
    </Card>
  );
}
