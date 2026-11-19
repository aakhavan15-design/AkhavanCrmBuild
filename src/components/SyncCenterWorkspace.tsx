import React, { useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Clock3, Database, RefreshCw, ShieldCheck, Users, ShoppingCart, Receipt, Wallet, Package, Truck } from 'lucide-react';
import { AppState } from '../types';
import { useDataSyncStatus } from '../services/dataSyncController';
import { formatAppDate } from '../lib/utils';
import { Card } from './ui/Card';
import { DataQualityPanel } from './DataQualityPanel';

interface SyncCenterWorkspaceProps { state: AppState }

const fa = (n: number) => n.toLocaleString('fa-IR');

export function SyncCenterWorkspace({ state }: SyncCenterWorkspaceProps) {
  const sync = useDataSyncStatus();
  const [busy, setBusy] = useState<'push' | 'pull' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const stateAny = state as any;
  const collections = useMemo(() => [
    { key: 'accounts', label: 'مشتریان', icon: Users, count: state.accounts?.length || 0 },
    { key: 'quotes', label: 'پیشنهادها و مذاکرات', icon: ShoppingCart, count: state.quotes?.length || 0 },
    { key: 'invoices', label: 'فاکتورها', icon: Receipt, count: state.invoices?.length || 0 },
    { key: 'payments', label: 'پرداخت‌ها', icon: Wallet, count: state.payments?.length || 0 },
    { key: 'orders', label: 'سفارش‌ها', icon: Package, count: stateAny.salesOrders?.length || stateAny.orders?.length || 0 },
    { key: 'products', label: 'کالاها', icon: Package, count: state.externalProducts?.length || 0 },
    { key: 'cheques', label: 'چک‌ها', icon: Receipt, count: state.cheques?.length || 0 },
    { key: 'routes', label: 'مسیرها و توزیع', icon: Truck, count: state.routes?.length || 0 },
  ], [stateAny]);

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
      <div><h2 className="text-sm font-black">مجموعه‌های اطلاعاتی</h2><p className="mt-1 text-xs leading-6 text-text-secondary">تعداد رکوردهای موجود در هر مجموعه نمایش داده می‌شود. موتور فعلی وضعیت ارسال و دریافت را در سطح تصویر مرکزی گزارش می‌کند؛ بنابراین تا زمانی که رابط اتصال تفکیکی و گزارش مستقل هر مجموعه پیاده‌سازی نشده، وضعیت جداگانه یا دکمه اختصاصی ارسال یا دریافت برای ردیف‌ها نمایش داده نمی‌شود.</p></div>
      <div className="overflow-hidden rounded-xl border border-border divide-y divide-border/70">
        {collections.map(item => { const Icon = item.icon; return <div key={item.key} className="flex flex-wrap items-center gap-3 px-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-canvas text-text-secondary"><Icon size={17}/></span><div className="min-w-0 flex-1"><div className="text-xs font-bold text-text-main">{item.label}</div></div><div className="text-left"><div className="font-mono text-sm font-bold tabular-nums">{fa(item.count)}</div><div className="text-micro text-text-secondary">رکورد</div></div><span className="rounded-full border border-border bg-canvas px-2 py-1 text-micro text-text-secondary">{sync.isSqlActive ? 'تحت مدیریت صف مرکزی' : 'محلی'}</span></div>; })}
      </div>
    </Card>

    <DataQualityPanel state={state} />
    <p className="text-micro leading-6 text-text-muted">منابع خارجی مانند سامانه مالی فقط در صورت وجود رابط اتصال واقعی، مجوز معتبر و پاسخ قابل ردیابی در بخش یکپارچه‌سازی‌ها مدیریت می‌شوند. وضعیت آن منابع با وضعیت ذخیره‌سازی پایگاه داده سامانه یکی نیست.</p>
  </main>;
}
