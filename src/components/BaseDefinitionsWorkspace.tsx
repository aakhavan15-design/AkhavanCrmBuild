/**
 * تعاریف پایه و داده — صفحهٔ «تعاریف» (زیرمنوی /workspace/master).
 * هر تعریف یا نمای اطلاعات پایه (کلاس‌های قیمت، کالا و قیمت/حداقل مرجع، مشتریان) اینجاست؛ «تنظیمات» فقط سیاست‌ها و پیکربندی است.
 * داده‌های ERP فقط‌خواندنی‌اند؛ تنها چیز قابل‌ویرایش، نام نمایشی کلاس‌های قیمت است.
 */
import React, { useMemo, useState } from 'react';
import { Building2, Users, UsersRound, UserRound, Tags, Package, Store, Wallet, Route as RouteIcon, MapPinned, Truck, UserCheck, Landmark, BookOpen, Target, BadgePercent, Boxes, CreditCard, CircleDollarSign, Layers } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AppState } from '../types';
import { resolvePriceClassLabels, PRICE_CLASS_CODES } from '../lib/cpqEngine';
import { PriceClassDefinitionsPanel } from './settings/PriceClassDefinitionsPanel';
import { SalesTargetsCommissionsPanel } from './SalesTargetsCommissionsPanel';
import { SettingsWorkspace } from './SettingsWorkspace';
import { useCan } from '../hooks/useCan';
import { Card } from './ui/Card';
import { InputControl } from './ui/Input';
import { cn } from '../lib/utils';
import { formatNumber } from '../lib/format';

interface Props { state: AppState; updateState: (u: (d: AppState) => AppState | void) => void }
type TabId = 'home' | 'org' | 'users' | 'groups' | 'personnel' | 'price-classes' | 'products' | 'customers' | 'finance-codes' | 'routes' | 'geo' | 'suppliers' | 'sellers' | 'distributors' | 'drivers' | 'product-groups' | 'sales-targets' | 'commissions' | 'payment-mappings' | 'detail-groups' | 'expense-budgets' | 'salary-definitions' | 'credit-policies';
const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'org', label: 'سازمان و واحدها', icon: Building2 },
  { id: 'users', label: 'کاربران و نقش‌ها', icon: Users },
  { id: 'groups', label: 'تیم‌ها و گروه‌ها', icon: UsersRound },
  { id: 'personnel', label: 'پرسنل', icon: UserRound },
  { id: 'price-classes', label: 'کلاس‌های قیمت', icon: Tags },
  { id: 'products', label: 'کالا و قیمت مرجع', icon: Package },
  { id: 'customers', label: 'مشتریان', icon: Store },
  { id: 'finance-codes', label: 'کدینگ و تعاریف مالی', icon: Wallet },
  { id: 'routes', label: 'مسیرها و تورها', icon: RouteIcon },
  { id: 'geo', label: 'زون و تخصیص جغرافیایی', icon: MapPinned },
  { id: 'suppliers', label: 'تأمین‌کنندگان', icon: Boxes },
  { id: 'sellers', label: 'فروشندگان و ویزیتورها', icon: UserCheck },
  { id: 'distributors', label: 'توزیع‌کنندگان', icon: Store },
  { id: 'drivers', label: 'رانندگان و ناوگان', icon: Truck },
  { id: 'product-groups', label: 'گروه کالا و برند', icon: Layers },
  { id: 'sales-targets', label: 'اهداف فروش', icon: Target },
  { id: 'commissions', label: 'طرح‌های پورسانت', icon: BadgePercent },
  { id: 'payment-mappings', label: 'ماهیت پرداخت', icon: CreditCard },
  { id: 'detail-groups', label: 'گروه‌های تفصیلی', icon: BookOpen },
  { id: 'expense-budgets', label: 'بودجه و گروه هزینه', icon: Wallet },
  { id: 'salary-definitions', label: 'تعاریف حقوق و مزایا', icon: CircleDollarSign },
  { id: 'credit-policies', label: 'سیاست‌های اعتبار', icon: Landmark }
];
const DEFINITION_GROUPS = [
  { title: 'تعاریف کلی', items: ['org', 'users', 'groups', 'personnel', 'routes', 'geo', 'drivers'] as TabId[] },
  { title: 'تعاریف فروش', items: ['price-classes', 'products', 'customers', 'suppliers', 'sellers', 'distributors', 'product-groups', 'sales-targets', 'commissions'] as TabId[] },
  { title: 'تعاریف مالی', items: ['finance-codes', 'payment-mappings', 'detail-groups', 'expense-budgets', 'salary-definitions', 'credit-policies'] as TabId[] }
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
  const raw = state as unknown as Record<string, any>;
  const rows = (key: string) => Array.isArray(raw[key]) ? raw[key] : [];
  const supplierRows = accounts.filter(a => String(a.accountType ?? a.type ?? '').toUpperCase() === 'SUPPLIER');
  const distributorRows = [...accounts.filter(a => String(a.accountType ?? a.type ?? '').toUpperCase() === 'DISTRIBUTOR'), ...rows('distributors')];
  const sellerRows = rows('erpVisitRouteStaff').filter((r: any) => /SELL|VISIT|SALES/i.test(String(r.staffRoleCode ?? r.roleCode ?? r.role ?? '')));
  const genericSections: Partial<Record<TabId, Array<{title: string; rows: any[]; available: boolean; owner: string; route?: string}>>> = {
    geo: [
      { title: 'زون‌های جغرافیایی', rows: rows('geoZones'), available: Array.isArray(raw.geoZones), owner: 'CRM' },
      { title: 'تخصیص زون‌ها', rows: rows('zoneAssignments'), available: Array.isArray(raw.zoneAssignments), owner: 'CRM' },
      { title: 'تعاریف معیار جغرافیایی', rows: rows('geoMetricDefinitions'), available: Array.isArray(raw.geoMetricDefinitions), owner: 'CRM' }
    ],
    suppliers: [{ title: 'تأمین‌کنندگان ERP', rows: supplierRows, available: true, owner: 'ERP · فقط‌خواندنی', route: '/accounts' }],
    sellers: [{ title: 'فروشندگان و ویزیتورهای متصل به مسیر', rows: sellerRows, available: Array.isArray(raw.erpVisitRouteStaff), owner: 'ERP · فقط‌خواندنی', route: '/geo-intelligence' }],
    distributors: [{ title: 'توزیع‌کنندگان', rows: distributorRows, available: Array.isArray(raw.accounts) || Array.isArray(raw.distributors), owner: 'مطابق منبع هر رکورد' }],
    drivers: [{ title: 'رانندگان', rows: rows('drivers'), available: Array.isArray(raw.drivers), owner: 'مطابق منبع ERP/CRM', route: '/operations?tab=dispatch' }],
    'product-groups': [
      { title: 'گروه‌های کالا', rows: rows('productGroups'), available: Array.isArray(raw.productGroups), owner: 'ERP · فقط‌خواندنی' },
      { title: 'برندها', rows: rows('productBrands'), available: Array.isArray(raw.productBrands), owner: 'ERP · فقط‌خواندنی' }
    ],
    'payment-mappings': [{ title: 'نگاشت ماهیت پرداخت', rows: rows('paymentNatureMappings'), available: Array.isArray(raw.paymentNatureMappings), owner: 'ERP/CRM · مطابق مالکیت نگاشت', route: '/finance?tab=treasury' }],
    'detail-groups': [
      { title: 'گروه‌های تفصیلی', rows: rows('detailGroups'), available: Array.isArray(raw.detailGroups), owner: 'ERP · فقط‌خواندنی', route: '/finance' },
      { title: 'نگاشت هویت به تفصیلی', rows: rows('accountMapRules'), available: Array.isArray(raw.accountMapRules), owner: 'CRM · مجوزدار', route: '/finance' }
    ],
    'expense-budgets': [
      { title: 'بودجه‌های هزینه', rows: rows('expenseBudgets'), available: Array.isArray(raw.expenseBudgets), owner: 'CRM · نسخه‌دار', route: '/finance' },
      { title: 'گروه‌های گزارش هزینه', rows: rows('reportBuckets'), available: Array.isArray(raw.reportBuckets), owner: 'ERP/CRM · مطابق منبع', route: '/finance' }
    ],
    'salary-definitions': [
      { title: 'پروفایل‌های حقوق', rows: rows('salaryProfiles'), available: Array.isArray(raw.salaryProfiles), owner: 'CRM · سیاست حقوق', route: '/finance' },
      { title: 'استحقاق مرخصی', rows: rows('leaveEntitlements'), available: Array.isArray(raw.leaveEntitlements), owner: 'CRM · سیاست پرسنلی', route: '/onboarding' }
    ],
    'credit-policies': [{ title: 'سیاست‌های اعتبار', rows: rows('creditPolicies'), available: Array.isArray(raw.creditPolicies), owner: 'CRM/ERP · مطابق منبع', route: '/operations?tab=credit' }]
  };
  const genericLabel = (row: any) => String(row.name ?? row.title ?? row.label ?? row.fullName ?? row.zoneName ?? row.routeName ?? row.accountName ?? row.code ?? row.id ?? '—');
  const genericCode = (row: any) => String(row.code ?? row.erpCode ?? row.externalId ?? row.status ?? '—');

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
              )) : <p className="text-micro text-ink-soft">رکوردی از منبع مرجع برای نمایش وجود ندارد.</p>}
            </Card>
          ))}
          <p className="text-micro text-ink-soft">مسیرها و تورهای دریافتی از منبع مرجع در CRM فقط‌خواندنی هستند.</p>
        </div>
      )}


      {genericSections[tab] && (
        <div className="space-y-3">
          {genericSections[tab]!.map(section => {
            const filtered = section.rows.filter(row => !q || [genericLabel(row), genericCode(row)].join(' ').toLowerCase().includes(q));
            return <Card key={section.title} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2"><h3 className="text-caption font-bold text-ink">{section.title}</h3><span className="text-micro text-ink-soft">{section.owner}</span></div>
              {section.available ? filtered.length ? filtered.slice(0, LIMIT).map((row: any, i: number) => (
                <div key={row.id ?? row.externalId ?? row.code ?? i} className="flex items-center justify-between gap-2 border-t border-border py-2 text-micro">
                  <span className="font-semibold text-ink">{genericLabel(row)}</span><span className="font-mono text-ink-soft">{genericCode(row)}</span>
                </div>
              )) : <p className="text-micro text-ink-soft">در منبع متصل رکوردی برای نمایش وجود ندارد.</p>
              : <p className="text-micro text-warning">جدول/Provider این موجودیت در state متصل حاضر نیست؛ وضعیت NOT IMPLEMENTED و بدون داده ساختگی.</p>}
              {section.route && <Link to={section.route} className="inline-flex text-micro font-bold text-primary pt-1">بازکردن فضای مالک</Link>}
            </Card>;
          })}
          <p className="text-micro text-ink-soft">تعاریف ERP فقط‌خواندنی‌اند. دکمهٔ ایجاد فقط برای موجودیت‌های CRM-owned و دارای فرم/endpoint واقعی نمایش داده می‌شود؛ برای این فهرست عمومی هیچ CRUD ساختگی فعال نیست.</p>
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

      {(tab === 'sales-targets' || tab === 'commissions') && (
        <SalesTargetsCommissionsPanel
          state={state}
          updateState={updateState}
          initialView={tab === 'sales-targets' ? 'targets' : 'commissions'}
          canEdit={!!can('internal', 'EDIT')}
          canApprove={!!can('settings', 'EDIT')}
        />
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
              <div className="text-micro text-ink-soft">{p.sku || p.code || '—'} · در هر کارتن: <b className="font-mono">{fa(p.unitsPerCarton)}</b></div>
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
