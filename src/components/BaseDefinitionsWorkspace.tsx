/**
 * تعاریف پایه و داده — صفحهٔ «تعاریف» (زیرمنوی /workspace/master).
 * هر تعریف یا نمای اطلاعات پایه (کلاس‌های قیمت، کالا و قیمت/کف ERP، مشتریان) اینجاست؛ «تنظیمات» فقط سیاست‌ها و پیکربندی است.
 * داده‌های ERP فقط‌خواندنی‌اند؛ تنها چیز قابل‌ویرایش، نام نمایشی کلاس‌های قیمت است.
 */
import React, { useMemo, useState } from 'react';
import { Building2, Users, UsersRound, UserRound, Tags, Package, Store, Wallet, Route as RouteIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AppState } from '../types';
import { resolvePriceClassLabels, PRICE_CLASS_CODES } from '../lib/cpqEngine';
import { PriceClassDefinitionsPanel } from './settings/PriceClassDefinitionsPanel';
import { SettingsWorkspace } from './SettingsWorkspace';
import { useCan } from '../hooks/useCan';
import { Card } from './ui/Card';
import { InputControl } from './ui/Input';
import { cn } from '../lib/utils';
import { formatNumber } from '../lib/format';

interface Props { state: AppState; updateState: (u: (d: AppState) => AppState | void) => void }
type TabId = 'home' | 'org' | 'users' | 'groups' | 'personnel' | 'price-classes' | 'products' | 'customers' | 'finance-codes' | 'routes';
const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'org', label: 'سازمان و واحدها', icon: Building2 },
  { id: 'users', label: 'کاربران و نقش‌ها', icon: Users },
  { id: 'groups', label: 'تیم‌ها و گروه‌ها', icon: UsersRound },
  { id: 'personnel', label: 'پرسنل', icon: UserRound },
  { id: 'price-classes', label: 'کلاس‌های قیمت', icon: Tags },
  { id: 'products', label: 'کالا و قیمت مرجع', icon: Package },
  { id: 'customers', label: 'مشتریان', icon: Store },
  { id: 'finance-codes', label: 'کدینگ و تعاریف مالی', icon: Wallet },
  { id: 'routes', label: 'مسیرها و تورها', icon: RouteIcon }
];
const DEFINITION_GROUPS = [
  { title: 'تعاریف کلی', items: ['org', 'users', 'groups', 'personnel'] as TabId[] },
  { title: 'تعاریف فروش', items: ['price-classes', 'products', 'customers'] as TabId[] },
  { title: 'تعاریف مالی', items: ['finance-codes'] as TabId[] },
  { title: 'تعاریف میدانی', items: ['routes'] as TabId[] }
];
const fa = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? formatNumber(n) : 'نامعلوم');
const LIMIT = 100;

export function BaseDefinitionsWorkspace({ state, updateState }: Props) {
  const [params, setParams] = useSearchParams();
  const tab: TabId = (TABS.find(t => t.id === params.get('tab'))?.id) ?? 'home';
  const [query, setQuery] = useState('');
  const { can, canOn } = useCan(state, updateState);
  const labels = useMemo(() => resolvePriceClassLabels((state.settings as any)?.orgConfig?.priceClassLabels, state.externalProducts), [state.settings, state.externalProducts]);
  const labelOf = (code: string) => labels.find(l => l.code === code)?.label || code;
  const q = query.trim().toLowerCase();
  const personnel = ((state.personnelFiles as any[]) || []).filter(f => !f?.deletedAt);

  const products = (state.externalProducts || []).filter(p => !q || [p.name, p.sku, p.code, p.erpId].filter(Boolean).join(' ').toLowerCase().includes(q));
  const accounts = (state.accounts || [])
    .filter(a => canOn('accounts', 'VIEW', { ownerId: a.ownerId, branchId: a.branchId, territoryId: a.territoryId, teamId: a.teamId, tenantId: a.tenantId }))
    .filter(a => !q || [a.name, a.code, a.city, a.phone].filter(Boolean).join(' ').toLowerCase().includes(q));

  return (
    <div className="space-y-3" dir="rtl">
      {tab === 'home' ? (
        <div className="space-y-5" aria-label="دسته‌بندی تعاریف">
          {DEFINITION_GROUPS.map(group => (
            <section key={group.title} className="space-y-2">
              <h2 className="text-caption font-extrabold text-ink">{group.title}</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {group.items.map(id => {
                  const item = TABS.find(t => t.id === id)!;
                  const Icon = item.icon;
                  return <button key={id} type="button" onClick={() => setParams({ tab: id })}
                    className="min-w-0 flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-2 py-3 text-center hover:border-primary/50">
                    <span className="size-12 rounded-full border border-border bg-canvas flex items-center justify-center text-primary"><Icon size={21} aria-hidden /></span>
                    <span className="text-micro font-bold text-ink leading-5">{item.label}</span>
                  </button>;
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setParams({})} className="text-caption font-bold text-primary">بازگشت به تعاریف</button>
          <div className="flex items-center gap-2"><h2 className="text-caption font-extrabold text-ink">{TABS.find(t => t.id === tab)?.label}</h2>{tab === 'customers' && canOn('accounts', 'CREATE') && <Link to="/accounts?create=1" className="rounded-lg bg-primary px-3 py-2 text-micro font-bold text-on-primary">+ ثبت مشتری</Link>}</div>
        </div>
      )}

      {(tab === 'org' || tab === 'users' || tab === 'groups') && <SettingsWorkspace mode="definitions" state={state} updateState={updateState} />}

      {tab === 'finance-codes' && (
        <div className="space-y-3">
          {[
            { title: 'کدینگ حسابداری منبع مرجع', rows: state.coaMirror || [], code: 'code', name: 'name' },
            { title: 'تعاریف سرفصل گزارش', rows: state.reportBuckets || [], code: 'key', name: 'title' },
            { title: 'نگاشت حساب‌ها', rows: state.accountMapRules || [], code: 'erpAccountCode', name: 'crmEntityType' },
            { title: 'حساب‌های بانکی', rows: state.bankMaps || [], code: 'accountNumber', name: 'bankName' },
            { title: 'صندوق‌ها', rows: state.cashboxMaps || [], code: 'erpAccountCode', name: 'cashboxName' }
          ].map(section => (
            <Card key={section.title} className="p-3 space-y-2">
              <h3 className="text-caption font-bold text-ink">{section.title}</h3>
              {section.rows.length ? section.rows.slice(0, LIMIT).map((row: any, i: number) => (
                <div key={row.id || row.code || i} className="flex items-center justify-between gap-2 border-t border-border py-2 text-micro">
                  <span className="font-semibold text-ink">{String(row[section.name] ?? '—')}</span>
                  <span className="font-mono text-ink-soft">{String(row[section.code] ?? '—')}</span>
                </div>
              )) : <p className="text-micro text-ink-soft">رکوردی از منبع دادهٔ متصل دریافت نشده است.</p>}
            </Card>
          ))}
          <p className="text-micro text-ink-soft">کدینگ‌های آینه‌شده از منبع مرجع فقط‌خواندنی‌اند؛ نگاشت‌های CRM باید از مسیر مالکیت و مجوز همان ماژول ویرایش شوند.</p>
        </div>
      )}

      {tab === 'routes' && (
        <div className="space-y-2">
          {[
            { title: 'مسیرهای مرجع', rows: state.erpVisitRoutes || [] },
            { title: 'تورهای ویزیت مرجع', rows: state.erpVisitTours || [] },
            { title: 'کارکنان مسیر', rows: state.erpVisitRouteStaff || [] },
            { title: 'مشتریان مسیر', rows: state.erpVisitRouteCustomers || [] },
            { title: 'دلایل عدم سفارش', rows: state.erpVisitNoOrderReasons || [] }
          ].map(section => (
            <Card key={section.title} className="p-3 space-y-2">
              <h3 className="text-caption font-bold text-ink">{section.title}</h3>
              {section.rows.length ? section.rows.slice(0, LIMIT).map((row: any, i: number) => (
                <div key={row.id || row.externalId || i} className="border-t border-border py-2 text-micro">
                  <div className="font-semibold text-ink">{String(row.name || row.routeName || row.tourName || row.reasonTitleFa || row.code || '—')}</div>
                  <div className="text-ink-soft">{String(row.code || row.routeCode || row.externalId || '—')}</div>
                </div>
              )) : <p className="text-micro text-ink-soft">رکوردی از ERP برای نمایش وجود ندارد.</p>}
            </Card>
          ))}
          <p className="text-micro text-ink-soft">مسیرها و تورهای دریافتی از منبع مرجع در CRM فقط‌خواندنی هستند.</p>
        </div>
      )}

      {tab === 'personnel' && (
        <div className="space-y-2" aria-label="تعاریف پرسنل">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Link to="/onboarding?tab=files"><Card className="p-3 text-compact font-bold text-text-main">پرونده‌ها و کدهای پرسنلی</Card></Link>
            <Link to="/definitions?tab=users"><Card className="p-3 text-compact font-bold text-text-main">وضعیت استخدام و خط گزارش‌دهی</Card></Link>
          </div>
          {personnel.slice(0, LIMIT).map((f: any, i: number) => (
            <Card key={f.id ?? i} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-compact font-bold text-text-main truncate">{f.fullName || f.name || '—'}</div>
                <div className="text-micro text-ink-soft truncate">{[f.personnelCode || f.code, f.jobTitle || f.position, f.department].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              {f.employmentStatus && <span className="shrink-0 text-micro font-bold text-primary">{String(f.employmentStatus)}</span>}
            </Card>
          ))}
          {personnel.length === 0 && <p className="text-center text-caption text-ink-soft py-6">پروندهٔ پرسنلی برای نمایش وجود ندارد.</p>}
        </div>
      )}

      {tab === 'price-classes' && (
        <Card className="p-4"><PriceClassDefinitionsPanel state={state} updateState={updateState} canEdit={!!can('settings', 'EDIT')} /></Card>
      )}

      {(tab === 'products' || tab === 'customers') && (
        <InputControl aria-label="جست‌وجو" type="search" placeholder={tab === 'products' ? 'نام یا کد کالا...' : 'نام، کد، شهر یا تلفن مشتری...'} value={query} onChange={e => setQuery(e.target.value)} />
      )}

      {tab === 'products' && (
        <div className="space-y-2" aria-label="کالاها">
          {products.slice(0, LIMIT).map(p => (
            <Card key={p.id} className="p-3 space-y-1.5">
              <div className="text-compact font-bold text-text-main truncate">{p.name}</div>
              <div className="text-micro text-ink-soft">{p.sku || p.code || '—'} · حداقل قیمت مرجع: <b className="font-mono">{fa(p.floorPrice)}</b> · در هر کارتن: <b className="font-mono">{fa(p.unitsPerCarton)}</b></div>
              <div className="grid grid-cols-2 gap-1.5 text-micro">
                {PRICE_CLASS_CODES.map(code => (
                  <div key={code} className="rounded-lg bg-sunken px-2 py-1 flex justify-between gap-2"><span className="text-ink-soft truncate">{labelOf(code)}</span><b className="font-mono">{p.priceClasses?.[code] ? fa(p.priceClasses[code]!.unitPrice) : 'نیامده'}</b></div>
                ))}
              </div>
            </Card>
          ))}
          {products.length === 0 && <p className="text-center text-caption text-ink-soft py-6">کالایی یافت نشد.</p>}
          {products.length > LIMIT && <p className="text-center text-micro text-ink-soft">{fa(LIMIT)} مورد اول از {fa(products.length)} نمایش داده شد؛ جست‌وجو را دقیق‌تر کنید.</p>}
          <p className="text-micro text-ink-soft">واحد پول و مقیاس قیمت به‌ازای واحد پایه از منبع مرجع دریافت می‌شود؛ این اطلاعات فقط‌خواندنی‌اند.</p>
        </div>
      )}

      {tab === 'customers' && (
        <div className="space-y-2" aria-label="مشتریان">
          {accounts.slice(0, LIMIT).map(a => (
            <Link key={a.id} to={`/accounts/${a.id}`} className="block">
              <Card className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-compact font-bold text-text-main truncate">{a.name}</div>
                  <div className="text-micro text-ink-soft truncate">{[a.code, a.city, a.phone].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <span className="shrink-0 text-micro font-bold text-primary">{typeof a.priceClassCode === 'string' && (PRICE_CLASS_CODES as readonly string[]).includes(a.priceClassCode) ? labelOf(a.priceClassCode) : 'کلاس قیمت تعریف نشده'}</span>
              </Card>
            </Link>
          ))}
          {accounts.length === 0 && <p className="text-center text-caption text-ink-soft py-6">مشتری مجازی یافت نشد.</p>}
          {accounts.length > LIMIT && <p className="text-center text-micro text-ink-soft">{fa(LIMIT)} مورد اول از {fa(accounts.length)} نمایش داده شد.</p>}
        </div>
      )}
    </div>
  );
}
