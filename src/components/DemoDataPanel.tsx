import React, { useState } from 'react';
import { Database, Trash2, X } from 'lucide-react';
import { AppState } from '../types';
import { applyDemoSeed, purgeDemoData, DemoSeedReport } from '../lib/seed';
import { applyDemoSeedExtended } from '../lib/seedExtended';
import { Button } from './ui/Button';
import { getStateSyncEngine, isSqlProviderActive } from '../services/stateSyncRuntime';
import { getActiveDataProvider } from '../services/dataProvider';

const LABELS: Record<string, string> = {
  users: 'کاربر/پرسنل (با تصویر)', accounts: 'مشتری', suppliers: 'تأمین‌کننده', externalProducts: 'کالا', quotes: 'پیش‌فاکتور', invoices: 'فاکتور', payments: 'پرداخت',
  cheques: 'چک', paymentAllocations: 'تخصیص پرداخت', supplierBills: 'فاکتور خرید', expenses: 'هزینه', tasks: 'وظیفه', activities: 'فعالیت', visits: 'ویزیت',
  salesOrders: 'سفارش آزمایشی', dispatchPlans: 'برنامه پخش', salesReturns: 'برگشتی', commercialPolicies: 'قانون تجاری', reconciliationCases: 'پرونده مغایرت', purchaseRequests: 'درخواست خرید',
  timelineEvents: 'خط زمان', opportunities: 'فرصت فروش', leads: 'سرنخ', messages: 'پیام گروهی', notifications: 'اعلان', auditLogs: 'ممیزی', groups: 'گروه',
  articles: 'مقاله پایگاه دانش', cases: 'تیکت پشتیبانی', campaigns: 'کمپین بازاریابی', internalRequests: 'درخواست اداری', internalMeetings: 'جلسه کاری',
  onboardingApplications: 'متقاضی استخدام', personnelFiles: 'پرونده پرسنلی', geoZones: 'محدوده جغرافیایی (زون)', financeRequests: 'دستور پرداخت مالی', creditNotes: 'سند بستانکاری',
  treasuryAccounts: 'حساب خزانه (صندوق/بانک)', treasuryTransactions: 'تراکنش خزانه', purchaseOrders: 'سفارش خرید', goodsReceipts: 'رسید کالا', supplierPayments: 'پرداخت به تأمین‌کننده', stockMovements: 'حرکت موجودی کالا', bankMaps: 'نگاشت حساب بانکی', cashboxMaps: 'نگاشت صندوق'
};

/** دادهٔ آزمایشی در ساخت توسعه یا ساختی که صریحاً برای دمو فعال شده مدیریت می‌شود. */
export function DemoDataPanel({ state, updateState, canManage }: { state: AppState; updateState: (u: (d: AppState) => AppState | void) => void; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<DemoSeedReport | null>(null);
  const [removed, setRemoved] = useState<number | null>(null);
  const [sqlNote, setSqlNote] = useState<string | null>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  const demoContext = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_DATA === 'true';
  const allowed = canManage && demoContext;
  if (!allowed) return null;

  const generate = () => { if (!canManage) return; let rep: DemoSeedReport | null = null; updateState(d => { const a = applyDemoSeed(d); const b = applyDemoSeedExtended(d); const created: Record<string, number> = { ...a.created }; Object.entries(b.created).forEach(([k, v]) => { created[k] = (created[k] || 0) + v; }); rep = { created, skipped: a.skipped + b.skipped, total: a.total + b.total }; }); setReport(rep); setRemoved(null); };
  const purge = () => { if (!canManage) return; let n = 0; updateState(d => { n = purgeDemoData(d); }); setRemoved(n); setReport(null); };

  // SQL-first: push everything currently held locally (incl. generated demo rows) to SQL, then report integrity.
  const sqlActive = isSqlProviderActive();
  const uploadToSql = async () => {
    const engine = getStateSyncEngine();
    if (!engine || sqlBusy) { setSqlNote('اتصال پایگاه داده فعال نیست؛ ابتدا وارد شوید و حالت ذخیره‌سازی را روی «پایگاه دادهٔ مرکزی» تنظیم کنید.'); return; }
    setSqlBusy(true); setSqlNote(null);
    try {
      const up = await engine.bootstrapFromLocal();
      const integrity = await getActiveDataProvider().getStateIntegrity();
      setSqlNote(`${up.upserted.toLocaleString('fa-IR')} رکورد در پایگاه داده ثبت شد${up.rejected ? ` — ${up.rejected.toLocaleString('fa-IR')} مورد به‌دلیل دسترسی/اعتبارسنجی رد شد` : ''}. بررسی یکپارچگی: ${integrity.issueCount === 0 ? 'بدون ارجاع شکسته' : `${integrity.issueCount.toLocaleString('fa-IR')} ارجاع شکسته`}.`);
    } catch (e: Record<string, unknown>) { setSqlNote(`ارسال به پایگاه داده ناموفق بود: ${e?.message || 'خطای ناشناخته'}`); }
    finally { setSqlBusy(false); }
  };

  return (
    <>
      <Button variant="secondary" size="sm" icon={<Database size={14} />} onClick={() => setOpen(true)}>داده آزمایشی</Button>
      {open && (
        <div className="fixed inset-0 z-(--z-drawer) flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="داده آزمایشی">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="glass-strong relative m-3 w-full max-w-lg rounded-4xl p-6 animate-in slide-in-from-bottom duration-300">
            <button onClick={() => setOpen(false)} aria-label="بستن" className="glass absolute end-4 top-4 grid h-10 w-10 cursor-pointer place-items-center rounded-full text-ink"><X size={16} /></button>
            <h3 className="text-sm font-extrabold text-ink">داده آزمایشی (فقط محیط تست)</h3>
            <p className="mt-2 text-xs leading-6 text-ink-soft">
              رکوردهای فارسی و واقع‌نما با شناسه‌های «demo-» اضافه می‌شوند. اجرای مجدد رکورد تکراری نمی‌سازد، داده واقعی هرگز تغییر نمی‌کند و «حذف داده آزمایشی» فقط همین رکوردها را برمی‌دارد. تصاویر پرسنل پرتره‌های سبک‌وار تولیدشده هستند، نه عکس واقعی.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={generate} icon={<Database size={14} />}>تولید داده آزمایشی</Button>
              <Button variant="danger" onClick={() => { if (window.confirm('همه رکوردهای آزمایشی حذف شوند؟ داده واقعی دست‌نخورده می‌ماند.')) purge(); }} icon={<Trash2 size={14} />}>حذف داده آزمایشی</Button>
            </div>
            {report && (
              <div className="mt-4 rounded-2xl bg-ink/[.05] p-4 text-xs text-ink">
                <div className="mb-2 font-bold">{report.total.toLocaleString('fa-IR')} رکورد جدید ایجاد شد{report.skipped ? ` — ${report.skipped.toLocaleString('fa-IR')} رکورد از قبل وجود داشت` : ''}</div>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1">{(Object.entries(report.created) as [string, number][]).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-ink-soft">{LABELS[k] || k}</span><b className="font-mono">{v.toLocaleString('fa-IR')}</b></li>)}</ul>
              </div>
            )}
            {removed !== null && <div className="mt-4 rounded-2xl bg-ink/[.05] p-4 text-xs font-bold text-ink">{removed.toLocaleString('fa-IR')} رکورد آزمایشی حذف شد.</div>}
            <div className="mt-4 border-t border-border pt-4">
              <div className="text-xs font-bold text-ink">همگام‌سازی با پایگاه دادهٔ مرکزی</div>
              <p className="mt-1 text-caption leading-6 text-ink-soft">{sqlActive ? 'همه داده‌ها و تنظیمات از طریق لایهٔ داده در پایگاه داده ذخیره می‌شوند. این دکمه داده فعلی (از جمله آزمایشی) را یک‌جا به پایگاه داده می‌فرستد؛ فقط ادغام می‌کند و چیزی حذف نمی‌شود.' : 'حالت فعلی: ذخیره محلی. برای اتصال پایگاه داده حالت ذخیره‌سازی را روی «پایگاه دادهٔ مرکزی» تنظیم کنید.'}</p>
              <div className="mt-2"><Button size="sm" variant="secondary" disabled={!sqlActive || sqlBusy} onClick={uploadToSql} icon={<Database size={14} />}>{sqlBusy ? 'در حال ارسال…' : 'ارسال داده فعلی به پایگاه داده'}</Button></div>
              {sqlNote && <div className="mt-2 rounded-2xl bg-ink/[.05] p-3 text-caption text-ink">{sqlNote}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
