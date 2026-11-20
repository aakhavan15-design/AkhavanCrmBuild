import React, { useState } from 'react';
import { Activity, AlertCircle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Clock3, Database, RefreshCw, ShieldCheck, Users, Receipt, Wallet, Package, Truck, MapPinned, Target, Landmark } from 'lucide-react';
import { AppState } from '../types';
import { useDataSyncStatus } from '../services/dataSyncController';
import { formatAppDate } from '../lib/utils';
import { useDataQuery } from '../hooks/useDataProvider';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { DataQualityPanel } from './DataQualityPanel';

interface SyncCenterWorkspaceProps { state: AppState }

const fa = (n: number) => n.toLocaleString('fa-IR');

const collections = [
  { key: 'externalProducts', label: 'کالاها', icon: Package },
  { key: 'accounts', label: 'مشتریان', icon: Users },
  { key: 'suppliers', label: 'تأمین‌کنندگان', icon: Truck },
  { key: 'geoZones', label: 'زون‌های جغرافیایی', icon: MapPinned },
  { key: 'zoneAssignments', label: 'تخصیص زون', icon: MapPinned },
  { key: 'users', label: 'کاربران', icon: Users },
  { key: 'roles', label: 'نقش‌ها', icon: ShieldCheck },
  { key: 'personnelFiles', label: 'پرونده‌های پرسنلی', icon: Users },
  { key: 'salesTargets', label: 'هدف‌گذاری فروش', icon: Target },
  { key: 'commissionPlans', label: 'پلکان پورسانت', icon: Target },
  { key: 'salaryProfiles', label: 'پروفایل حقوق', icon: Wallet },
  { key: 'coaMirror', label: 'کدینگ حسابداری', icon: Landmark },
  { key: 'treasuryAccounts', label: 'حساب‌های خزانه', icon: Landmark },
  { key: 'quotes', label: 'پیشنهادها', icon: Receipt },
  { key: 'invoices', label: 'فاکتورها', icon: Receipt },
  { key: 'payments', label: 'پرداخت‌ها', icon: Wallet },
  { key: 'salesOrders', label: 'سفارش‌ها', icon: Package },
  { key: 'cheques', label: 'چک‌ها', icon: Receipt },
] as const;

const erpBatchLabels: Record<string, string> = {
  RUNNING: 'در حال پردازش', SUCCEEDED: 'پایان موفق', PARTIAL: 'پذیرش ناقص', FAILED: 'ناموفق', CANCELLED: 'لغوشده',
};

export function SyncCenterWorkspace({ state }: SyncCenterWorkspaceProps) {
  const sync = useDataSyncStatus();
  const [busy, setBusy] = useState<'push' | 'pull' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: inventory, loading: inventoryLoading, error: inventoryError, refetch: reloadInventory } = useDataQuery(
    async provider => ({
      viewerId: state.currentUserId,
      ...await provider.getStateCounts(collections.map(item => item.key)),
    }),
    [state.currentUserId, sync.isSqlActive, sync.serverVersion, sync.lastSyncedAt]
  );
  const counts = !inventoryLoading && !inventoryError && inventory?.viewerId === state.currentUserId ? inventory : null;

  const { data: erpOverview, loading: erpLoading, refetch: reloadErp } = useDataQuery(
    async provider => ({ viewerId: state.currentUserId, ...await provider.getErpSyncOverview() }),
    [state.currentUserId, sync.isSqlActive]
  );
  const erp = !erpLoading && erpOverview?.viewerId === state.currentUserId ? erpOverview : null;
  const formatErpDate = (value: string | null) => value ? formatAppDate(value, state.settings?.locale) : 'نامشخص';

  const status = sync.state;
  const healthy = sync.isSqlActive && Boolean(sync.lastSyncedAt) && ['idle', 'completed'].includes(status) && sync.pendingCount === 0 && !sync.lastError;
  const statusText: Record<string, string> = {
    idle: sync.isSqlActive ? 'آماده و بدون تغییر معوق' : 'ذخیره‌سازی محلی / محیط فعلی',
    completed: 'آخرین عملیات با موفقیت انجام شد',
    syncing: 'در حال همگام‌سازی', saving: 'در حال ارسال تغییرات', retrieving: 'در حال دریافت اطلاعات',
    retrying: 'در حال تلاش مجدد', failed: 'همگام‌سازی ناموفق', offline: 'دستگاه آفلاین است'
  };

  const run = async (kind: 'push' | 'pull') => {
    setBusy(kind); setNotice(null);
    try {
      const ok = kind === 'push' ? await sync.syncNow() : await sync.retrieveNow();
      setNotice(ok ? (kind === 'push' ? 'ارسال تغییرات به پایگاه داده مرکزی انجام شد.' : 'دریافت اطلاعات از پایگاه داده مرکزی انجام شد.') : (sync.lastError || 'عملیات انجام نشد؛ وضعیت و خطا را بررسی کنید.'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'عملیات همگام‌سازی با خطا مواجه شد.');
    } finally { setBusy(null); }
  };

  const lastSync = sync.lastSyncedAt ? formatAppDate(sync.lastSyncedAt, state.settings?.locale) : 'هنوز ثبت نشده';
  const dotClass = healthy ? 'bg-emerald-500' : ['failed', 'offline'].includes(status) ? 'bg-rose-500' : ['saving', 'syncing', 'retrieving', 'retrying'].includes(status) ? 'bg-amber-500 animate-pulse' : 'bg-slate-400';

  return <main dir="rtl" className="crm-page min-h-full space-y-5 px-3 py-4 sm:px-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-xs font-bold text-primary"><Database size={15}/> مدیریت داده</div><h1 id="sync-center-heading" data-tour-heading className="mt-1 text-xl font-black text-text-main">مرکز همگام‌سازی داده‌ها</h1><p className="mt-1 max-w-2xl text-xs leading-6 text-text-secondary">وضعیت ذخیره و بازیابی اطلاعات سامانه از پایگاه داده مرکزی را از یک نقطه مدیریت کنید. وضعیت این صفحه مربوط به همگام‌سازی پایگاه داده سامانه است، نه اتصال تک‌تک رکوردها به سامانه مالی خارجی.</p></div>
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-xs font-bold"><span className={`h-2.5 w-2.5 rounded-full ${dotClass} ${healthy ? 'shadow-[0_0_0_4px_rgba(16,185,129,.12)]' : ''}`}/>{statusText[status] || statusText.idle}</div>
    </header>

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card padding="md" className="space-y-2"><div className="flex items-center justify-between text-xs text-text-secondary"><span>وضعیت پایگاه داده</span><Database size={16}/></div><div className="text-lg font-black">{sync.isSqlActive ? 'پایگاه داده مرکزی' : 'ذخیره‌سازی محلی'}</div><div className="text-micro text-text-secondary">{sync.isSqlActive ? 'درگاه ذخیره‌سازی مرکزی فعال است.' : 'درگاه ذخیره‌سازی مرکزی در محیط فعلی فعال نیست.'}</div></Card>
      <Card padding="md" className="space-y-2"><div className="flex items-center justify-between text-xs text-text-secondary"><span>تغییرات در صف</span><Activity size={16}/></div><div className="text-lg font-black tabular-nums">{fa(sync.pendingCount)}</div><div className="text-micro text-text-secondary">رکوردهای منتظر ارسال</div></Card>
      <Card padding="md" className="space-y-2"><div className="flex items-center justify-between text-xs text-text-secondary"><span>آخرین همگام‌سازی موفق</span><Clock3 size={16}/></div><div className="text-lg font-black">{lastSync}</div><div className="text-micro text-text-secondary">نسخه سرور: {fa(sync.serverVersion)}</div></Card>
    </section>

    <Card padding="lg" className="space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-primary"/><h2 className="text-sm font-black">عملیات مرکزی</h2></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-2 text-sm font-bold"><ArrowUpFromLine size={17}/> ارسال تغییرات</div><p className="mt-2 text-xs leading-6 text-text-secondary">ارسال تغییرات ثبت‌شده در سامانه به پایگاه داده مرکزی. این عملیات از صف تغییرات مرکزی استفاده می‌کند.</p><button type="button" disabled={!sync.isSqlActive || !!busy || status === 'offline'} onClick={() => void run('push')} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw size={14} className={busy === 'push' ? 'animate-spin' : ''}/>{busy === 'push' ? 'در حال ارسال...' : 'ارسال تغییرات'}</button></div>
        <div className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-2 text-sm font-bold"><ArrowDownToLine size={17}/> دریافت اطلاعات</div><p className="mt-2 text-xs leading-6 text-text-secondary">بازیابی تصویر معتبر وضعیت از پایگاه داده مرکزی و تازه‌سازی وضعیت داده‌های محلی.</p><button type="button" disabled={!sync.isSqlActive || !!busy || status === 'offline'} onClick={() => void run('pull')} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-canvas px-4 text-xs font-bold text-text-main disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw size={14} className={busy === 'pull' ? 'animate-spin' : ''}/>{busy === 'pull' ? 'در حال دریافت...' : 'دریافت اطلاعات'}</button></div>
      </div>
      {notice && <div role="status" className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-text-main">{notice}</div>}
      {sync.lastError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger"><AlertCircle size={15} className="mt-0.5 shrink-0"/>{sync.lastError}</div>}
    </Card>

    <Card padding="lg" className="space-y-3">
      <section aria-labelledby="collection-inventory-heading" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="collection-inventory-heading" className="text-sm font-black">موجودی مجموعه‌های داده</h2>
            <p className="mt-1 text-xs leading-6 text-text-secondary">شمارش از {sync.isSqlActive ? 'پایگاه دادهٔ CRM' : 'داده‌های محلی همین دستگاه'} می‌آید. تازگی منبع ERP و درصد نگاشت برای این مجموعه‌ها هنوز در دسترس نیست.</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={inventoryLoading} onClick={() => void reloadInventory()} icon={<RefreshCw size={14} />}>
            بازخوانی شمارش
          </Button>
        </div>
        {inventoryLoading && <p role="status" className="text-xs text-text-secondary">در حال دریافت شمارش مجموعه‌ها…</p>}
        {inventoryError && <p role="alert" className="text-xs text-danger">شمارش مجموعه‌ها در دسترس نیست. بازخوانی کنید.</p>}
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
          {collections.map(({ key, label, icon: Icon }) => {
            const count = counts?.collections[key];
            const hasCount = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
            const result = counts?.hiddenCollections.includes(key)
              ? 'فاقد مجوز'
              : hasCount ? (count === 0 ? 'خالی' : `${fa(count)} رکورد`) : 'نامشخص';
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-text-main"><Icon size={15} aria-hidden="true" /> {label}</span>
                <span className="text-xs tabular-nums text-text-secondary">{result}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </Card>

    <Card padding="lg">
      <section aria-labelledby="erp-overview-heading" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="erp-overview-heading" className="text-sm font-black">سوابق ورود داده از ERP</h2>
            <p className="mt-1 text-xs text-text-secondary">آخرین دستهٔ ثبت‌شده برای حداکثر ۲۵ اتصال ورودی CRM.</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={erpLoading} onClick={() => void reloadErp()}>
            بازخوانی سوابق
          </Button>
        </div>
        {erpLoading && <p role="status" className="text-xs text-text-secondary">در حال دریافت سوابق ERP…</p>}
        {!erpLoading && (!erp || erp.status === 'UNAVAILABLE') &&
          <p role="alert" className="text-xs text-danger">سوابق ورود ERP در دسترس نیست.</p>}
        {erp?.status === 'RESTRICTED' && <p className="text-xs text-text-secondary">مجوز مشاهدهٔ سوابق ERP را ندارید.</p>}
        {erp?.status === 'EMPTY' && <p className="text-xs text-text-secondary">اتصال ورودی ثبت نشده است.</p>}
        {erp?.status === 'AVAILABLE' && (
          <ul className="space-y-2">
            {erp.items.map(item => (
              <li key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-text-main">{item.displayName}</h3>
                  <span className="text-xs text-text-secondary">{item.enabled ? 'فعال در تنظیمات' : 'غیرفعال در تنظیمات'}</span>
                </div>
                {item.batchStatus ? (
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary sm:grid-cols-4">
                    <div><dt>آخرین دسته</dt><dd className="text-text-main">{erpBatchLabels[item.batchStatus] || 'نامشخص'}</dd></div>
                    <div><dt>تاریخ پایان</dt><dd className="text-text-main">{formatErpDate(item.finishedAt)}</dd></div>
                    <div><dt>نقطهٔ ادامهٔ منبع</dt><dd className="text-text-main">{formatErpDate(item.watermark)}</dd></div>
                    <div><dt>دریافتی / ردشده</dt><dd className="text-text-main">{item.received == null ? 'نامشخص' : fa(item.received)} / {item.rejected == null ? 'نامشخص' : fa(item.rejected)}</dd></div>
                  </dl>
                ) : <p className="mt-2 text-xs text-text-secondary">برای این اتصال هنوز دسته‌ای ثبت نشده است.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>

    <DataQualityPanel state={state} />
    <p className="text-micro leading-6 text-text-muted">منابع خارجی مانند سامانه مالی فقط در صورت وجود رابط اتصال واقعی، مجوز معتبر و پاسخ قابل ردیابی در بخش یکپارچه‌سازی‌ها مدیریت می‌شوند. وضعیت آن منابع با وضعیت ذخیره‌سازی پایگاه داده سامانه یکی نیست.</p>
  </main>;
}
