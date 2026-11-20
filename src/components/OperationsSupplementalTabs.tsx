import React, { useState } from 'react';
import { generateSecureId } from '../lib/secureId';
import { ShoppingCart, ShieldCheck, Gauge } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge, StatusBadge } from './ui/Badge';
import { Input, Select } from './ui/Input';
import { guard, requireActiveUser, useCan } from '../hooks/useCan';
import { calculateProfitability, buildOperationsMetrics, calculateCreditMetrics, analyzeReturns } from '../lib/operationsEngine';
import { formatAppDate, formatRialOrUnknown, matchesSearch } from '../lib/utils';
import { useDataQuery } from '../hooks/useDataProvider';
import { resolveCustomerBalanceView } from '../lib/receivableReconciliation';
import { buildLedgerAgingInputs, estimateLedgerAging } from '../services/agingBuckets';
import { useDataSyncStatus } from '../services/dataSyncController';
import type { AppState } from '../types';
import type { RecordScope } from '../lib/rbac';

interface PurchaseRequestView {
  id: string;
  requestNumber: string;
  supplierId: string;
  productId: string;
  quantity: number;
  reason: string;
  status: string;
}

type ScopedOperation = Record<string, unknown> & RecordScope & { id: string; createdBy?: string };
type StateUpdater = (updater: (draft: AppState) => AppState | void) => void;

const money = formatRialOrUnknown;
const readKnownAmount = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};
const newId = (p: string) => generateSecureId(p);
const log = (draft: AppState, action: string, type: string, id: string, details: string) => {
  draft.auditLogs = [...(draft.auditLogs || []), {
    id: newId('audit'), action, entityType: type, entityId: id, details,
    actor: draft.currentUserId || 'unknown', createdAt: new Date().toISOString(),
  }].slice(-1000);
};

const catalogPageSize = 25;
const catalogBrand = (brand: unknown) => typeof brand === 'string' ? brand.trim() : '';

export function InventoryTab({ state }: { state: AppState }) {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState(1);
  const products = (state.externalProducts || []).filter(product => !product.deletedAt);
  const brands = [...new Set(products.map(product => catalogBrand(product.brand)).filter((value): value is string => !!value))]
    .sort((a, b) => a.localeCompare(b, 'fa'));
  const filtered = products.filter(product =>
    (!brand || catalogBrand(product.brand) === brand) &&
    matchesSearch([product.name, product.sku, product.code, product.brand, product.category].filter(Boolean).join(' '), query)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / catalogPageSize));
  const activePage = Math.min(page, totalPages);
  const visibleProducts = filtered.slice((activePage - 1) * catalogPageSize, activePage * catalogPageSize);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-black text-text-main">کاتالوگ و وضعیت موجودی</h2>
        <p className="mt-1 text-xs leading-6 text-text-secondary">کالاها فقط‌خواندنی‌اند. قیمت و موجودی نمایش داده‌شده از رکورد CRM خوانده می‌شود. تازگی اتصال ERP راستی‌آزمایی نشده است.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input label="جست‌وجوی کالا" value={query} placeholder="نام، کد، گروه یا برند"
          onChange={event => { setQuery(event.target.value); setPage(1); }} />
        <div>
          <label htmlFor="inventory-brand" className="mb-1 block text-xs font-bold text-text-main">برند</label>
          <Select id="inventory-brand" value={brand} onChange={event => { setBrand(event.target.value); setPage(1); }}>
            <option value="">همهٔ برندها</option>
            {brands.map(value => <option key={value} value={value}>{value}</option>)}
          </Select>
        </div>
      </div>
      {visibleProducts.length === 0 ? (
        <EmptyState surface="operations"
          title={products.length ? 'کالایی با این فیلتر یافت نشد' : 'کاتالوگ خالی است'}
          description={products.length ? 'عبارت جست‌وجو یا برند را تغییر دهید.' : 'رکورد کالایی برای نمایش دریافت نشده است.'} />
      ) : (
        <div className="overflow-x-auto" role="region" aria-label="جدول کاتالوگ و موجودی" tabIndex={0}>
          <table className="w-full min-w-(--size-620) text-right text-xs">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                {['کالا', 'کد', 'منبع', 'قیمت ثبت‌شده', 'مالیات', 'موجودی', 'ارزش FIFO', 'نقطه سفارش', 'وضعیت'].map(label =>
                  <th key={label} scope="col" className="p-3">{label}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map(product => {
                const stock = readKnownAmount(product.stock);
                const minimum = readKnownAmount(product.minStock);
                const tax = readKnownAmount(product.taxRatePercent);
                const fifo = readKnownAmount(product.inventoryValueFifo);
                const brandLabel = catalogBrand(product.brand);
                const isSample = product.source === 'LOCAL_TEST' || String(product.id).startsWith('demo-');
                const asOf = typeof product.stockAsOf === 'string' && /^\d{4}-\d{2}-\d{2}/.test(product.stockAsOf) && Number.isFinite(Date.parse(product.stockAsOf))
                  ? formatAppDate(product.stockAsOf, state.settings?.locale) : null;
                return (
                  <tr key={product.id} className="border-b border-border last:border-0">
                    <th scope="row" className="p-3 font-bold text-text-main">
                      <span>{product.name}</span>
                      {(product.category || brandLabel) && <span className="mt-1 block font-normal text-text-secondary">{[product.category, brandLabel].filter(Boolean).join(' · ')}</span>}
                    </th>
                    <td className="p-3 text-text-secondary" dir="auto">{product.sku || product.code || '—'}</td>
                    <td className="p-3">{isSample ? <Badge variant="warning">آزمایشی</Badge> : 'رکورد CRM'}</td>
                    <td className="p-3">{money(readKnownAmount(product.unitPrice ?? product.basePrice))}</td>
                    <td className="p-3" data-testid="product-tax-rate">
                      {tax === null ? 'نامشخص' : tax === 0 ? <Badge variant="success">معاف (۰٪)</Badge> : `${tax.toLocaleString('fa-IR')}٪`}
                    </td>
                    <td className="p-3">
                      {stock === null ? 'نامشخص' : stock.toLocaleString('fa-IR')}
                      {stock !== null && asOf && <span className="mt-1 block whitespace-nowrap text-text-secondary">{asOf}</span>}
                    </td>
                    <td className="p-3" data-testid="product-fifo-value">{money(fifo)}</td>
                    <td className="p-3">{minimum === null ? 'تعریف نشده' : minimum.toLocaleString('fa-IR')}</td>
                    <td className="p-3">
                      {stock === null ? <Badge variant="neutral">بدون داده معتبر</Badge>
                        : minimum === null ? <Badge variant="neutral">آستانه تعریف نشده</Badge>
                          : stock <= minimum ? <Badge variant="warning">به نقطه سفارش رسیده</Badge>
                            : <Badge variant="success">در محدوده</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {totalPages > 1 && (
        <nav aria-label="صفحه‌بندی کاتالوگ" className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>قبلی</Button>
          <span className="text-xs text-text-secondary">صفحهٔ {activePage.toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')}</span>
          <Button size="sm" variant="outline" disabled={activePage === totalPages} onClick={() => setPage(activePage + 1)}>بعدی</Button>
        </nav>
      )}
    </Card>
  );
}

export function PurchasingTab({ state, updateState }: { state: AppState; updateState: StateUpdater }) {
  const suppliers: { id: string; name: string }[] = state.suppliers || [];
  const products = state.externalProducts || [];
  const requests: PurchaseRequestView[] = state.purchaseRequests || [];
  const [supplierId,setSupplierId] = useState(''); const [productId,setProductId] = useState(''); const [quantity,setQuantity] = useState(''); const [reason,setReason] = useState('');
  const submit = (e: React.FormEvent) => { e.preventDefault(); if(!guard(state,updateState,'internal','EDIT','ثبت درخواست خرید آزمایشی')||!requireActiveUser(state,updateState,'ثبت درخواست خرید')) return; const qty=Number(quantity); const supplier=suppliers.find(s=>s.id===supplierId); const product=products.find(p=>p.id===productId); if(!supplier||!product||!Number.isFinite(qty)||qty<=0||!reason.trim()) return; const item={id:newId('pr'),requestNumber:`PR-TEST-${requests.length+1}`,supplierId,productId,quantity:qty,status:'OPEN',reason:reason.trim(),source:'LOCAL_TEST',createdBy:state.currentUserId,createdAt:new Date().toISOString()}; updateState(d=>{d.purchaseRequests=[...(d.purchaseRequests||[]),item];log(d,'CREATED','PurchaseRequest',item.id,'درخواست خرید آزمایشی ایجاد شد؛ سفارش خرید رسمی یا تغییر موجودی انجام نشده است');});setSupplierId('');setProductId('');setQuantity('');setReason(''); };
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,1fr)]"><Card><h2 className="mb-4 font-black text-text-main">درخواست‌های خرید</h2><div className="space-y-2">{requests.map(r=><div key={r.id} className="rounded-2xl border border-border p-3"><div className="flex flex-wrap justify-between gap-2"><b className="text-xs text-text-main">{r.requestNumber}</b><StatusBadge status={r.status}/></div><div className="mt-2 text-xs text-text-secondary">تأمین‌کننده: {suppliers.find(s=>s.id===r.supplierId)?.name||'نامشخص'} · کالا: {products.find(p=>p.id===r.productId)?.name||'نامشخص'}</div><div className="mt-1 text-xs text-text-main">تعداد: {Number(r.quantity).toLocaleString('fa-IR')} · {r.reason}</div><div className="mt-2 text-micro text-warning">درخواست داخلی آزمایشی؛ سفارش خرید رسمی ثبت نشده است.</div></div>)}{!requests.length&&<p className="py-8 text-center text-sm text-text-secondary">درخواست خریدی ثبت نشده است.</p>}</div></Card><Card><h2 className="mb-4 font-black text-text-main">ثبت درخواست خرید آزمایشی</h2><form className="space-y-3" onSubmit={submit}><div><label className="mb-1 block text-xs font-bold text-text-main">تأمین‌کننده</label><Select aria-label="تأمین‌کننده" required value={supplierId} onChange={e=>setSupplierId(e.target.value)} ><option value="">انتخاب تأمین‌کننده</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select></div><div><label className="mb-1 block text-xs font-bold text-text-main">کالا</label><Select aria-label="کالا" required value={productId} onChange={e=>setProductId(e.target.value)} ><option value="">انتخاب کالا</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></div><Input label="تعداد درخواستی" type="number" min="0.001" step="any" required value={quantity} onChange={e=>setQuantity(e.target.value)}/><Input label="دلیل درخواست" required value={reason} onChange={e=>setReason(e.target.value)} placeholder="کمبود موجودی، سفارش مشتری..."/><Button className="w-full" type="submit" icon={<ShoppingCart size={15}/>} disabled={!supplierId||!productId||Number(quantity)<=0||!reason.trim()}>ثبت درخواست داخلی</Button></form></Card></div>;
}

export function CreditTab({ state }: { state: AppState }) {
  const { canOn, can } = useCan(state);
  const canViewFinance = can('finance', 'VIEW');
  const canViewPayments = canViewFinance && can('payments', 'VIEW');
  const { serverVersion } = useDataSyncStatus();
  const customers = (state.accounts || state.customers || []).filter(customer =>
    can('accounts', 'VIEW') ? canOn('accounts', 'VIEW', customer) : canOn('finance', 'VIEW', customer)
  );
  const financeCustomers = new Map(customers
    .filter(customer => canOn('finance', 'VIEW', customer))
    .map(customer => [customer.id, customer]));
  const invoices = (state.invoices || []).filter(invoice =>
    financeCustomers.has(invoice.customerId || invoice.accountId || '')
  );
  const payments = canViewPayments ? (state.payments || []).filter(payment => {
    const customer = financeCustomers.get(payment.customerId || payment.accountId);
    return customer && canOn('payments', 'VIEW', customer);
  }) : [];
  const cheques = state.cheques?.filter(cheque => financeCustomers.has(cheque.customerId));

  const ledger = useDataQuery(
    provider => canViewFinance ? provider.getDetailSubsidiaryBalances() : Promise.resolve(null),
    [canViewFinance, state.currentUserId, serverVersion]
  );
  const allocations = useDataQuery(
    provider => canViewPayments ? provider.getPaymentAllocations() : Promise.resolve(null),
    [canViewPayments, state.currentUserId, serverVersion]
  );

  const ledgerResult = canViewFinance && !ledger.loading && !ledger.error ? ledger.data : null;
  const balances = new Map([...financeCustomers.values()].map(customer => [
    customer.id, resolveCustomerBalanceView(ledgerResult, customer)
  ]));
  const completeCustomers = [...financeCustomers.values()].filter(customer => {
    const balance = balances.get(customer.id);
    return balance?.kind === 'OK' && !balance.incomplete;
  });
  const aging = estimateLedgerAging(buildLedgerAgingInputs(ledgerResult, completeCustomers, invoices));
  const overdueByCustomer = new Map(aging.customers.map(customer => [
    customer.id,
    customer.unattributed > 0 || customer.covered.some(invoice => invoice.days === null)
      ? null
      : customer.covered.filter(invoice => invoice.days !== null && invoice.days > 0).length
  ]));

  const invoiceIds = new Set(invoices.map(invoice => invoice.id));
  const paymentIds = new Set(payments.map(payment => payment.id));
  const reviewableAllocations = canViewPayments && !allocations.loading && !allocations.error
    ? allocations.data?.filter(row => invoiceIds.has(row.invoiceId) && paymentIds.has(row.paymentId))
    : undefined;
  const creditMetrics = calculateCreditMetrics({
    invoices: invoices.map(invoice => ({ ...invoice })),
    payments: payments.map(payment => ({ ...payment })),
    allocations: reviewableAllocations?.map(allocation => ({ ...allocation })),
    cheques,
  });
  const number = (value: number | null) => value === null
    ? 'نامشخص'
    : value.toLocaleString('fa-IR', { maximumFractionDigits: 1 });
  const metrics = [
    { label: 'میانگین روزهای تسویه (نمونه‌های تخصیص)', value: creditMetrics.averageSettlementDays },
    { label: 'میانه روزهای تسویه (نمونه‌های تخصیص)', value: creditMetrics.medianSettlementDays },
    { label: 'چک برگشتی', value: canViewFinance && cheques ? creditMetrics.bouncedChequeCount : null },
    { label: 'چک تعیین‌تکلیف‌نشده', value: canViewFinance && cheques ? creditMetrics.unresolvedChequeCount : null },
  ];
  const ledgerError = canViewFinance && (ledger.error?.message
    || (ledger.data?.status === 'UNAVAILABLE' && (ledger.data.reason || 'اتصال برقرار نیست.')));

  return (
    <Card className="p-3 sm:p-5 border-border/80 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-sm sm:text-base text-text-main">میز اعتبار و ریسک مشتری</h2>
        <Badge variant="warning">نیازمند تطبیق با حسابداری</Badge>
      </div>
      {ledgerError && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-danger">
          <span>دریافت ماندهٔ دفتری ناموفق بود. {ledgerError}</span>
          <Button type="button" variant="ghost" onClick={() => void ledger.refetch()}>تلاش مجدد</Button>
        </div>
      )}
      {canViewPayments && allocations.error && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-danger">
          <span>دریافت تخصیص‌ها ناموفق بود. {allocations.error.message}</span>
          <Button type="button" variant="ghost" onClick={() => void allocations.refetch()}>تلاش مجدد</Button>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {metrics.map(metric => (
          <div key={metric.label} className="rounded-xl border border-border/70 bg-surface p-3">
            <div className="text-micro font-medium text-text-secondary">{metric.label}</div>
            <div className="mt-1.5 text-base font-bold tabular-nums text-text-main">{number(metric.value)}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full min-w-(--size-700) text-right text-xs divide-y divide-border/60">
          <thead>
            <tr className="bg-canvas/60 text-text-secondary text-caption">
              {['مشتری', 'ماندهٔ دفتری', 'سقف اعتبار', 'اعتبار باقی‌مانده تقریبی', 'اسناد سررسیدگذشته (تخمینی)', 'ارزیابی'].map(label => (
                <th key={label} scope="col" className="p-2.5 whitespace-nowrap font-bold">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 bg-surface">
            {customers.map(customer => {
              const ledgerBalance = balances.get(customer.id);
              const balance = ledgerBalance?.kind === 'OK' && !ledgerBalance.incomplete ? ledgerBalance.total : null;
              const limit = financeCustomers.has(customer.id) && Number.isFinite(customer.creditLimit) && Number(customer.creditLimit) > 0
                ? Number(customer.creditLimit) : null;
              const overdue = overdueByCustomer.get(customer.id) ?? null;
              const remaining = balance !== null && limit !== null ? limit - balance : null;
              return (
                <tr key={customer.id} className="hover:bg-canvas/50">
                  <th scope="row" className="p-2.5 font-bold text-text-main">{customer.name}</th>
                  <td className="p-2.5 tabular-nums">
                    {canViewFinance && ledger.loading && financeCustomers.has(customer.id) ? '…' : money(balance)}
                    {ledgerBalance?.kind === 'OK' && (
                      <ul className="mt-1 space-y-1 text-text-secondary">
                        {ledgerBalance.subsidiaries.map(line => (
                          <li key={JSON.stringify([line.subsidiaryCode, line.periodCode])}>
                            {line.subsidiaryCode || 'فاقد نگاشت'} · {money(line.balance)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-2.5 tabular-nums">{money(limit)}</td>
                  <td className="p-2.5 tabular-nums">{money(remaining)}</td>
                  <td className="p-2.5 tabular-nums">{number(overdue)}</td>
                  <td className="p-2.5">
                    {remaining === null ? <Badge variant="neutral">داده ناکافی</Badge>
                      : remaining < 0 || (overdue !== null && overdue > 0) ? <Badge variant="danger">نیازمند بررسی</Badge>
                      : overdue === null ? <Badge variant="neutral">سررسید نامشخص</Badge>
                      : <Badge variant="success">بدون هشدار محاسباتی</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!customers.length && <p className="p-3 text-xs text-text-secondary">مشتری قابل مشاهده‌ای وجود ندارد.</p>}
      </div>
      <p className="mt-3 text-caption text-text-secondary">سررسید از ماندهٔ دفتری و فاکتورهای معتبر تخمین زده می‌شود. تخصیص‌های CRM فقط برای بررسی نمونه‌های دریافت استفاده می‌شوند.</p>
    </Card>
  );
}

export function OperationsReportsTab({ state }: { state: AppState }) {
  const { canOn, can } = useCan(state);
  const canViewFinance = can('finance', 'VIEW');
  const customers = new Map((state.accounts || state.customers || []).map(customer => [customer.id, customer]));
  const orders: ScopedOperation[] = ((state.salesOrders || []) as ScopedOperation[]).filter(order =>
    can('quotes', 'VIEW') ? canOn('quotes', 'VIEW', order) : canOn('finance', 'VIEW', order)
  );
  const orderIds = new Set(orders.map(order => order.id));
  const invoices = (state.invoices || []).filter(invoice => {
    const customer = customers.get(invoice.accountId || invoice.customerId);
    return customer && (canViewFinance ? canOn('finance', 'VIEW', customer) : canOn('accounts', 'VIEW', customer));
  }).map(invoice => ({ ...invoice }));
  const returns: ScopedOperation[] = ((state.salesReturns || []) as ScopedOperation[]).filter(row =>
    (typeof row.orderId === 'string' && orderIds.has(row.orderId)) || canOn('finance', 'VIEW', row)
  );
  const plans: ScopedOperation[] = ((state.dispatchPlans || []) as ScopedOperation[]).filter(plan => {
    const scope = { ...plan, ownerId: plan.createdBy };
    return can('internal', 'VIEW') ? canOn('internal', 'VIEW', scope) : canOn('finance', 'VIEW', scope);
  });
  const payments = (state.payments || []).filter(payment => {
    const customer = customers.get(payment.accountId || payment.customerId);
    return canViewFinance && customer && canOn('payments', 'VIEW', customer);
  }).map(payment => ({ ...payment }));
  const cases: ScopedOperation[] = ((state.reconciliationCases || []) as ScopedOperation[]).filter(row =>
    canOn('finance', 'VIEW', row) || (Boolean(state.currentUserId) && row.assignedTo === state.currentUserId)
  );
  const expenses: ScopedOperation[] = ((state.expenses || []) as ScopedOperation[]).filter(row => canOn('finance', 'VIEW', row));
  const metrics=buildOperationsMetrics({orders,invoices,returns,dispatchPlans:plans,payments});
  const profitability=calculateProfitability({invoices,returns,payments,orders,dispatchPlans:plans,expenses});
  const costCoverage=canViewFinance && orders.length?orders.filter(o=>o.costKnown===true).length/orders.length*100:null;
  const returnCauses=analyzeReturns(returns);
  const left=[{label:'کل سفارش‌ها',value:metrics.orderCount},{label:'تأیید یا آزادشده',value:metrics.approvedOrders},{label:'لغوشده',value:metrics.cancelledOrders},{label:'سفارش دارای پیوند مستقیم به فاکتور',value:metrics.invoicedOrderCount},{label:'برگشتی‌های ثبت‌شده',value:metrics.returnCount},{label:'برگشتی منتظر سند مالی',value:returns.filter((r: Record<string, unknown>)=>r.financialDocumentConfirmed!==true).length}];
  const right=[{label:'پوشش بهای تمام‌شده',value:costCoverage===null?'نامشخص':`${costCoverage.toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`},{label:'تازگی اطلاعات مالی',value:'به‌روزرسانی زنده در دسترس نیست'},{label:'پوشش وزن و ظرفیت پخش',value:metrics.dispatchCapacityCoverage===null?'نامشخص':`${metrics.dispatchCapacityCoverage.toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`},{label:'مغایرت‌های باز',value:cases.filter(c=>c.status!=='RESOLVED').length},{label:'وجه تسویه‌شده قابل مشاهده',value:canViewFinance && payments.length ? money(profitability.clearedPayments) : 'نامشخص'},{label:'سود عملیاتی پخش',value:!canViewFinance || profitability.operationalProfit===null?'غیرقابل محاسبه':money(profitability.operationalProfit)}];
  return <div className="grid gap-4 xl:grid-cols-2"><Card><div className="mb-4 flex items-center gap-2"><Gauge size={17} className="text-primary"/><h2 className="font-black text-text-main">گزارش کیفیت چرخه سفارش</h2></div><div className="space-y-3">{left.map(x=><div key={x.label} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0"><span className="text-xs text-text-secondary">{x.label}</span><b className="text-sm text-text-main">{Number(x.value).toLocaleString('fa-IR')}</b></div>)}</div></Card><Card><div className="mb-4 flex items-center gap-2"><ShieldCheck size={17} className="text-primary"/><h2 className="font-black text-text-main">گزارش پوشش داده و کیفیت</h2></div><div className="space-y-3">{right.map(x=><div key={x.label} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0"><span className="text-xs text-text-secondary">{x.label}</span><b className="text-xs text-text-main">{x.value}</b></div>)}</div><div className="mt-4 border-t border-border pt-3"><h3 className="mb-2 text-xs font-black text-text-main">تحلیل علت برگشت (بر اساس دسته‌بندی ثبت‌شده)</h3>{returnCauses.length?returnCauses.map(c=><div key={c.reasonCode} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"><div><div className="text-xs font-bold text-text-main">{c.reasonCode}</div><div className="mt-1 text-micro text-text-secondary">{c.count.toLocaleString('fa-IR')} مورد · تأیید سند: {c.confirmedCount.toLocaleString('fa-IR')}</div></div><div className="text-left text-xs font-bold text-text-main">{money(c.amount)}<div className="mt-1 text-micro font-normal text-warning">بدون سند: {money(c.unconfirmedAmount)}</div></div></div>):<p className="text-xs text-text-secondary">داده برگشت کافی نیست.</p>}</div><p className="mt-3 text-caption leading-6 text-text-secondary">گزارش‌ها در این فاز محلی و هم‌زمان هستند. صف گزارش سنگین، خروجی پس‌زمینه و تجمیع افزایشی در فاز دیتابیس/بک‌اند اجرا خواهد شد.</p></Card></div>;
}
