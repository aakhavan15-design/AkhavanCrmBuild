import React, { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BarChart3, CheckCircle2, CircleHelp, Filter,
  RefreshCw, SearchCheck, ShieldAlert, ShieldCheck, Sparkles
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import type { AppState } from '../types';
import { useCan } from '../hooks/useCan';
import {
  auditErpDataQuality, QUALITY_RULE_LABELS,
  type QualityDomain, type QualitySeverity
} from '../lib/erpDataQuality';
import { Card } from './ui/Card';
import { getActiveDataProvider } from '../services/dataProvider';
import { EmptyState } from './ui/EmptyState';

const fa = (n: number) => n.toLocaleString('fa-IR');
const DOMAIN_META: Record<QualityDomain, { label: string; short: string }> = {
  CUSTOMER: { label: 'اطلاعات مشتریان', short: 'مشتریان' },
  ROUTE: { label: 'مسیر و زون مشتریان', short: 'مسیرها' },
  PRODUCT: { label: 'اطلاعات کالا و کدینگ', short: 'کالا' },
  COA: { label: 'کدینگ حسابداری', short: 'کدینگ مالی' },
  JOURNAL: { label: 'اسناد حسابداری', short: 'اسناد مالی' },
};
const SEVERITY_META: Record<QualitySeverity, { label: string; tone: string }> = {
  HIGH: { label: 'بالا', tone: 'text-danger bg-danger/10 border-danger/20' },
  MEDIUM: { label: 'متوسط', tone: 'text-warning bg-warning/10 border-warning/20' },
  LOW: { label: 'کم', tone: 'text-text-secondary bg-sunken border-border' },
};
const CONTROL_CATALOG: Record<string, Array<{ label: string; domain?: QualityDomain }>> = {
  customers: [
    { label: 'کد ملی و شناسه اقتصادی', domain: 'CUSTOMER' }, { label: 'مشتری تکراری', domain: 'CUSTOMER' },
    { label: 'شماره تماس نامعتبر', domain: 'CUSTOMER' }, { label: 'تخصیص مسیر و زون', domain: 'ROUTE' },
    { label: 'سقف اعتبار و بدهی معوق' }, { label: 'مغایرت مانده و دریافت‌ها' },
  ],
  sales: [
    { label: 'کیفیت اطلاعات مشتری', domain: 'CUSTOMER' }, { label: 'کیفیت کدینگ کالا', domain: 'PRODUCT' },
    { label: 'قیمت خارج از لیست مصوب' }, { label: 'تخفیف بیش از مجوز' },
    { label: 'سفارش تکراری یا ناقص' }, { label: 'پورسانت و فروش خالص' },
  ],
  commerce: [
    { label: 'کد کالا و گروه‌بندی', domain: 'PRODUCT' }, { label: 'تخصیص مسیر مشتری', domain: 'ROUTE' },
    { label: 'سفارش ↔ فاکتور' }, { label: 'فاکتور ↔ حواله خروج' },
    { label: 'بارگیری ↔ تحویل' }, { label: 'مرجوعی ↔ موجودی' }, { label: 'تسویه مسیر و راننده' },
  ],
  finance: [
    { label: 'کدینگ و ماهیت حساب', domain: 'COA' }, { label: 'توازن اسناد حسابداری', domain: 'JOURNAL' },
    { label: 'شرح سند ↔ حساب', domain: 'JOURNAL' }, { label: 'مانده خلاف ماهیت حساب', domain: 'COA' },
    { label: 'مغایرت بانک و دفتر' }, { label: 'پرداخت تکراری و بدون مرجع' },
    { label: 'هزینه ↔ مرکز هزینه' },
  ],
  organization: [
    { label: 'کدینگ حسابداری', domain: 'COA' }, { label: 'کد و گروه کالا', domain: 'PRODUCT' },
    { label: 'تغییرات دسترسی کاربران' }, { label: 'تغییر اطلاعات پایه بدون مجوز' },
  ],
  home: [
    { label: 'کیفیت اطلاعات مشتری', domain: 'CUSTOMER' }, { label: 'مسیر و زون', domain: 'ROUTE' },
    { label: 'کدینگ کالا', domain: 'PRODUCT' }, { label: 'کدینگ حسابداری', domain: 'COA' },
    { label: 'اسناد حسابداری', domain: 'JOURNAL' },
  ],
  reports: [
    { label: 'کیفیت اطلاعات مشتری', domain: 'CUSTOMER' }, { label: 'مسیر و زون', domain: 'ROUTE' },
    { label: 'کدینگ کالا', domain: 'PRODUCT' }, { label: 'کدینگ حسابداری', domain: 'COA' },
    { label: 'اسناد حسابداری', domain: 'JOURNAL' },
  ],
  work: [
    { label: 'تأخیر تسک و گردش تأیید' }, { label: 'ارجاع و مسئولیت نامشخص' },
    { label: 'تغییر وضعیت خارج از گردش مجاز' }, { label: 'فعالیت غیرعادی کاربران' },
  ],
};
const MODULES: Record<string, { title: string; subtitle: string; domains: QualityDomain[]; scope: string }> = {
  home: { title: 'پایش سلامت سازمان', subtitle: 'نمای تجمیعی کنترل کیفیت داده‌های قابل ارزیابی در سامانه', domains: ['CUSTOMER','ROUTE','PRODUCT','COA','JOURNAL'], scope: 'تمام حوزه‌های دارای موتور کنترل' },
  customers: { title: 'پایش مغایرت مشتریان', subtitle: 'کنترل هویت، اطلاعات تماس، تکراری‌ها و تخصیص مسیر مشتریان', domains: ['CUSTOMER','ROUTE'], scope: 'مشتریان و مسیرهای مشتری' },
  sales: { title: 'پایش مغایرت فروش', subtitle: 'نمایش کنترل‌های داده‌ای مرتبط با مشتری و کالا؛ کنترل تراکنش فروش در مرحله اتصال بعدی', domains: ['CUSTOMER','PRODUCT'], scope: 'داده پایه مرتبط با فروش' },
  commerce: { title: 'پایش مغایرت بازرگانی و توزیع', subtitle: 'کنترل اطلاعات کالا و تخصیص مسیر؛ تطبیق سفارش، فاکتور، انبار و تحویل پس از اتصال جداول عملیاتی', domains: ['PRODUCT','ROUTE'], scope: 'کالا و مسیرهای توزیع' },
  finance: { title: 'پایش مغایرت مالی و حسابداری', subtitle: 'کنترل کدینگ، ماهیت حساب، سطرهای سند و توازن اسناد حسابداری', domains: ['COA','JOURNAL'], scope: 'کدینگ و اسناد حسابداری' },
  work: { title: 'پایش کیفیت کارها و گردش‌ها', subtitle: 'کنترل‌های اختصاصی تسک، تأیید و گردش کار هنوز به موتور پایش متصل نشده‌اند', domains: [], scope: 'گردش کار و فعالیت کاربران' },
  reports: { title: 'مرکز تحلیل مغایرت‌ها', subtitle: 'نمای تجمیعی یافته‌های موتورهای کنترل کیفیت داده', domains: ['CUSTOMER','ROUTE','PRODUCT','COA','JOURNAL'], scope: 'تمام حوزه‌های دارای موتور کنترل' },
  organization: { title: 'پایش داده و تنظیمات سازمان', subtitle: 'کنترل کیفیت کدینگ، کالا و داده‌های پایه؛ کنترل دسترسی و پیکربندی در توسعه بعدی', domains: ['PRODUCT','COA'], scope: 'اطلاعات پایه و کدینگ' },
};

export function AuditWorkspace({ state }: { state: AppState }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const moduleId = params.get('module') || 'home';
  const configuredProvider = useMemo(() => getActiveDataProvider().name, []);
  const providerLabel = configuredProvider === 'SQLSERVER_BACKEND' ? 'SQL Server' : 'ذخیره‌سازی محلی مرورگر';
  const config = MODULES[moduleId] || MODULES.home;
  const { can } = useCan(state);
  const canFinance = can('finance', 'VIEW');
  const canAccounts = can('accounts', 'VIEW');
  const canOperations = can('quotes', 'VIEW') || can('finance', 'VIEW');
  const canSeeDomain = (domain: QualityDomain) => {
    if (domain === 'CUSTOMER' || domain === 'ROUTE') return canAccounts;
    if (domain === 'COA' || domain === 'JOURNAL') return canFinance;
    if (domain === 'PRODUCT') return canOperations || canAccounts;
    return false;
  };
  const allowedDomains = config.domains.filter(canSeeDomain);
  const auditState = useMemo(() => ({
    ...(state as unknown as Record<string, unknown>),
    ...(canFinance ? {} : { coaMirror: [], journalLines: [] }),
    ...(canAccounts ? {} : { accounts: [], customers: [], geoZones: [], zoneAssignments: [], zoneGeometryVersions: [] }),
    ...(canOperations || canAccounts ? {} : { externalProducts: [] }),
  }), [state, canFinance, canAccounts, canOperations]);
  const result = useMemo(() => auditErpDataQuality(auditState), [auditState]);
  const [selectedDomain, setSelectedDomain] = useState<QualityDomain | 'ALL'>('ALL');
  const [severity, setSeverity] = useState<QualitySeverity | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const visibleDomain = selectedDomain === 'ALL' ? allowedDomains : allowedDomains.filter(d => d === selectedDomain);
  const domainFindings = result.issues.filter(issue => visibleDomain.includes(issue.domain));
  const findings = domainFindings.filter(issue =>
    (severity === 'ALL' || issue.severity === severity) &&
    (!query || `${issue.entityLabel} ${issue.message} ${issue.ruleCode} ${QUALITY_RULE_LABELS[issue.ruleCode] || ''}`.toLocaleLowerCase('fa-IR').includes(query.toLocaleLowerCase('fa-IR')))
  );
  const total = visibleDomain.reduce((sum, d) => sum + result.byDomain[d], 0);
  const high = domainFindings.filter(x => x.severity === 'HIGH').length;
  const medium = domainFindings.filter(x => x.severity === 'MEDIUM').length;
  const low = domainFindings.filter(x => x.severity === 'LOW').length;
  const chartData = visibleDomain.map(d => ({ name: DOMAIN_META[d].short, count: result.byDomain[d] }));
  const severityData = [
    { name: 'بالا', value: high, color: 'var(--c-danger)' },
    { name: 'متوسط', value: medium, color: 'var(--c-warning)' },
    { name: 'کم', value: low, color: 'var(--c-ink-muted)' },
  ].filter(x => x.value > 0);
  const notEvaluated = result.notEvaluated.filter(x => visibleDomain.includes(x.domain));
  const coverage = visibleDomain.reduce((sum, d) => {
    const key = d === 'CUSTOMER' || d === 'ROUTE' ? 'customers' : d === 'PRODUCT' ? 'products' : d === 'COA' ? 'accounts' : 'journalLines';
    return sum + (result.coverage[key] || 0);
  }, 0);

  if (!config) return <EmptyState surface="audit_workspace" title="بخش پایش پیدا نشد" description="فضای کاری انتخاب‌شده معتبر نیست." />;

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 pb-24 pt-4 sm:gap-5 sm:px-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/8 text-primary">
            <SearchCheck size={22} />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/8 px-2 py-1 text-micro font-bold text-primary">مرکز پایش</span>
              <span className="text-micro text-text-muted">منبع پیکربندی‌شده: {providerLabel}</span>
            </div>
            <h1 id="audit-heading" data-tour-heading className="text-lg font-black text-text-main sm:text-xl">{config.title}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-text-secondary">{config.subtitle}</p>
          </div>
        </div>
        <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-text-secondary hover:bg-sunken">
          <ArrowRight size={15} /> بازگشت
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-micro font-semibold text-text-secondary">حوزه: {config.scope}</span>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-micro font-semibold text-text-secondary">فقط خواندنی</span>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-micro font-semibold text-text-secondary">ارزیابی بر اساس قوانین فعال</span>
      </div>

      <Card padding="md" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div><h2 className="text-sm font-black text-text-main">دامنه کنترل‌های این بخش</h2><p className="text-micro text-text-muted">وضعیت واقعی اتصال هر گروه کنترلی</p></div>
          <span className="text-micro text-text-muted">{(CONTROL_CATALOG[moduleId] || CONTROL_CATALOG.home).length.toLocaleString('fa-IR')} کنترل</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(CONTROL_CATALOG[moduleId] || CONTROL_CATALOG.home).map((control, index) => {
            const active = !!control.domain && allowedDomains.includes(control.domain);
            return <div key={`${control.label}-${index}`} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2">
              <span className="text-xs font-semibold text-text-main">{control.label}</span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-micro font-bold ${active ? 'bg-success/10 text-success' : 'bg-sunken text-text-muted'}`}>{active ? 'قانون فعال' : 'در انتظار اتصال'}</span>
            </div>;
          })}
        </div>
      </Card>

      {allowedDomains.length === 0 ? (
        <Card padding="lg" className="space-y-2">
          <div className="flex items-center gap-2 text-text-main"><CircleHelp size={18} className="text-warning" /><strong className="text-sm">{config.domains.length > 0 ? 'دسترسی به داده‌های این حوزه برای نقش فعلی مجاز نیست' : 'قوانین این حوزه هنوز به داده واقعی متصل نشده‌اند'}</strong></div>
          <p className="text-xs leading-6 text-text-secondary">{config.domains.length > 0 ? 'برای مشاهده نتایج، دسترسی مرتبط باید توسط مدیر سامانه و بر اساس نقش سازمانی اعطا شود.' : 'برای جلوگیری از نمایش عدد ساختگی، تا زمان اتصال جداول و تعریف قوانین اختصاصی، نتیجه‌ای به‌عنوان سالم یا دارای مغایرت اعلام نمی‌شود.'}</p>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Card padding="md" className="space-y-1">
              <span className="text-micro text-text-muted">کل مغایرت‌های شناسایی‌شده</span>
              <strong className="text-2xl font-black tabular-nums text-text-main">{fa(total)}</strong>
              <span className="text-micro text-text-muted">در حوزه‌های قابل مشاهده</span>
            </Card>
            <Card padding="md" className="space-y-1">
              <span className="text-micro text-text-muted">شدت بالا</span>
              <strong className="text-2xl font-black tabular-nums text-danger">{fa(high)}</strong>
              <span className="text-micro text-text-muted">نیازمند بررسی سریع</span>
            </Card>
            <Card padding="md" className="space-y-1">
              <span className="text-micro text-text-muted">شدت متوسط</span>
              <strong className="text-2xl font-black tabular-nums text-warning">{fa(medium)}</strong>
              <span className="text-micro text-text-muted">نیازمند بازبینی</span>
            </Card>
            <Card padding="md" className="space-y-1">
              <span className="text-micro text-text-muted">رکوردهای تحت پوشش</span>
              <strong className="text-2xl font-black tabular-nums text-text-main">{fa(coverage)}</strong>
              <span className="text-micro text-text-muted">جمع پوشش حوزه‌های انتخابی؛ ممکن است رکوردها هم‌پوشانی داشته باشند</span>
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <Card padding="md" className="min-w-0 lg:col-span-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div><h2 className="text-sm font-black text-text-main">توزیع مغایرت بر اساس حوزه</h2><p className="text-micro text-text-muted">تعداد یافته‌های موتور کنترل</p></div>
                <BarChart3 size={17} className="text-primary" />
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="3 5" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--c-ink-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} width={32} tick={{ fill: 'var(--c-ink-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'var(--c-sunken)' }} contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text-primary)', fontSize: 12 }} />
                    <Bar dataKey="count" name="تعداد" fill="var(--c-primary)" radius={[7,7,0,0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card padding="md" className="min-w-0 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <div><h2 className="text-sm font-black text-text-main">ترکیب شدت مغایرت‌ها</h2><p className="text-micro text-text-muted">بر اساس یافته‌های قابل نمایش</p></div>
                <ShieldAlert size={17} className="text-warning" />
              </div>
              {severityData.length ? <div className="relative h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={severityData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={3}>
                    {severityData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie><Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text-primary)', fontSize: 12 }} /></PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl font-black tabular-nums text-text-main">{fa(high + medium + low)}</strong><span className="text-micro text-text-muted">یافته</span></div>
              </div> : <div className="grid h-52 place-items-center text-xs text-text-muted">داده‌ای برای نمودار شدت وجود ندارد.</div>}
              <div className="flex flex-wrap justify-center gap-3 text-micro text-text-secondary">
                {severityData.map(x => <span key={x.name} className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: x.color }} />{x.name}: {fa(x.value)}</span>)}
              </div>
            </Card>
          </section>

          {notEvaluated.length > 0 && <Card padding="md" className="border-warning/25 bg-warning/5">
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-text-main"><CircleHelp size={16} className="text-warning" /> حوزه‌های ارزیابی‌نشده</div>
            <ul className="space-y-1.5 text-xs leading-6 text-text-secondary">{notEvaluated.map((item, index) => <li key={`${item.domain}-${index}`}>• {DOMAIN_META[item.domain].label}: {item.reason}</li>)}</ul>
          </Card>}

          <Card padding="md" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-sm font-black text-text-main">فهرست یافته‌ها و مغایرت‌ها</h2><p className="text-micro text-text-muted">هر مورد باید توسط مسئول مربوطه بررسی شود؛ یافته هیوریستیک حکم قطعی نیست.</p></div>
              <span className="rounded-full bg-primary/8 px-2.5 py-1 text-micro font-bold text-primary">{fa(findings.length)} مورد قابل نمایش</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="فیلتر حوزه" value={selectedDomain} onChange={e => setSelectedDomain(e.target.value as QualityDomain | 'ALL')} className="min-h-10 rounded-xl border border-border bg-surface px-3 text-xs text-text-main">
                <option value="ALL">همه حوزه‌ها</option>{allowedDomains.map(d => <option key={d} value={d}>{DOMAIN_META[d].label}</option>)}
              </select>
              <select aria-label="فیلتر شدت" value={severity} onChange={e => setSeverity(e.target.value as QualitySeverity | 'ALL')} className="min-h-10 rounded-xl border border-border bg-surface px-3 text-xs text-text-main">
                <option value="ALL">همه شدت‌ها</option><option value="HIGH">بالا</option><option value="MEDIUM">متوسط</option><option value="LOW">کم</option>
              </select>
              <label className="flex min-h-10 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3">
                <Filter size={14} className="text-text-muted" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="جست‌وجوی شرح، سند یا قانون..." className="min-w-0 flex-1 bg-transparent text-xs text-text-main outline-none" />
              </label>
              <button type="button" onClick={() => { setSelectedDomain('ALL'); setSeverity('ALL'); setQuery(''); }} className="min-h-10 rounded-xl border border-border px-3 text-xs font-bold text-text-secondary">پاک‌سازی فیلتر</button>
            </div>
            {findings.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-text-secondary">با فیلترهای فعلی موردی برای نمایش وجود ندارد. این وضعیت فقط حوزه‌های ارزیابی‌شده را پوشش می‌دهد.</div> :
              <div className="divide-y divide-border/70">
                {findings.slice(0, 100).map(issue => <article key={issue.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {issue.severity === 'HIGH' ? <ShieldAlert size={15} className="text-danger" /> : <AlertTriangle size={15} className="text-warning" />}
                    <strong className="text-xs font-extrabold text-text-main">{QUALITY_RULE_LABELS[issue.ruleCode] || issue.ruleCode}</strong>
                    <span className={`rounded-full border px-2 py-0.5 text-micro font-bold ${SEVERITY_META[issue.severity].tone}`}>{SEVERITY_META[issue.severity].label}</span>
                    <span className="rounded-full bg-sunken px-2 py-0.5 text-micro text-text-secondary">{issue.confidence === 'DETERMINISTIC' ? 'نقض قاعده قطعی' : 'نیازمند بازبینی انسانی'}</span>
                    <span className="ms-auto text-micro text-text-muted">{DOMAIN_META[issue.domain].short}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-xs font-bold text-text-main">{issue.entityLabel}</span><span className="text-micro text-text-muted">شناسه رکورد: {issue.entityId}</span><span className="text-micro text-text-muted">قانون: {issue.ruleCode}</span></div>
                  <p className="text-xs leading-6 text-text-secondary">{issue.message}</p>
                  {issue.suggestion && <p className="text-xs leading-6 text-primary">پیشنهاد بررسی: {issue.suggestion}</p>}
                  {issue.evidence && <details className="text-micro text-text-muted"><summary className="cursor-pointer py-1 font-bold">مشاهده شواهد فنی</summary><pre className="mt-1 overflow-x-auto rounded-lg bg-sunken p-2 text-[10px]" dir="ltr">{JSON.stringify(issue.evidence, null, 2)}</pre></details>}
                </article>)}
              </div>}
            {findings.length > 100 && <p className="text-center text-micro text-text-muted">۱۰۰ مورد اول نمایش داده شده‌اند؛ برای بررسی کامل باید صفحه‌بندی سمت سرور به موتور افزوده شود.</p>}
          </Card>
        </>
      )}

      <Card padding="md" className="flex items-start gap-2">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-success" />
        <div className="text-xs leading-6 text-text-secondary">
          <strong className="text-text-main">مرز صحت داده:</strong> این صفحه خروجی موتور موجود کنترل کیفیت ERP را روی داده‌های بارگذاری‌شده در برنامه نمایش می‌دهد. کنترل سفارش، فاکتور، حواله، تحویل، پرداخت و تسویه تا زمان اتصال قواعد و جداول متناظر، «ارزیابی‌نشده» محسوب می‌شود؛ نبود یافته به معنی نبود مغایرت نیست. هیچ داده‌ای در ERP اصلاح یا حذف نمی‌شود.
        </div>
      </Card>
    </main>
  );
}
