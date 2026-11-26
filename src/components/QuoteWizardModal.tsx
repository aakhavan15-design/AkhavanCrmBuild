import { guard, useCan } from '../hooks/useCan';
import { formatNumber, formatMoney } from '../lib/format';
import { computeQuoteTax } from '../lib/taxRate';
import React, { useState, useEffect, useRef } from 'react';
import { AppState, Quote, ID, DraftQuoteState } from '../types';
import { generateId, nextSequenceNumber, formatCurrency, parsePersianNumber, formatInputCurrency, cleanNumericInput } from '../lib/utils';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { CheckCircle2, ChevronRight, ChevronLeft, Trash2, Printer, Percent, ShieldCheck, FileText, Save } from 'lucide-react';
import { CustomerInvoicePrint } from './PrintLayouts';
import { SearchableSelect, type SelectOption } from './ui/SearchableSelect';
import { InputControl, Checkbox } from './ui/Input';
import { getActiveDataProvider } from '../services/dataProvider';
import { toast } from './ui/Toast';
import { dataSyncController } from '../services/dataSyncController';
import { computeOrderBalance, resolvePriceClassLabels, PRICE_CLASS_CODES } from '../lib/cpqEngine';
import { QuotePricingStep, lineToBalanceInput } from './quote/QuotePricingStep';
import { OrderBalanceBar, formatSignedAmount } from './quote/OrderBalanceBar';

interface QuoteWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  onQuoteCreated?: (quoteId: ID) => void;
}

export function QuoteWizardModal({ isOpen, onClose, state, updateState, onQuoteCreated }: QuoteWizardModalProps) {
  const [creating,setCreating]=useState(false);
  const creationBusy=useRef(false);
  const creationAttempt=useRef<{key:string;quote:Quote}|null>(null);
  const draftState = state.draftQuote;
  const orgConfig = (state.settings as Record<string, unknown>)?.orgConfig || {};
  const configuredTaxRaw = orgConfig.taxRatePercent;
  const configuredTaxRate = configuredTaxRaw !== undefined && configuredTaxRaw !== null && String(configuredTaxRaw).trim() !== '' && Number.isFinite(Number(configuredTaxRaw)) && Number(configuredTaxRaw) >= 0 && Number(configuredTaxRaw) <= 100
    ? Number(configuredTaxRaw) : null;
  const configuredValidityDays = Number(orgConfig.quoteValidityDays);
  const defaultValidityDays = Number.isFinite(configuredValidityDays) && configuredValidityDays > 0 ? String(configuredValidityDays) : '';
  const { canOn } = useCan(state, updateState);
  const visibleAccounts = (state.accounts || []).filter(account => canOn('accounts', 'VIEW', {
    ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId, teamId: account.teamId, tenantId: account.tenantId
  }));
  const draftCustomerId = draftState?.selectedCustomerId || state.activeContextAccountId || '';
  const defaultCustomerId = visibleAccounts.some(account => account.id === draftCustomerId) ? draftCustomerId : (visibleAccounts[0]?.id || '');

  const [step, setStep] = useState<1 | 2 | 3 | 4>((draftState?.step as Record<string, unknown>) || 1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<ID>(defaultCustomerId);
  const [projectTitle, setProjectTitle] = useState(draftState?.projectTitle || '');
  const [validUntilDays, setValidUntilDays] = useState(draftState?.validUntilDays ?? defaultValidityDays);

  const [lines, setLines] = useState<DraftQuoteState['lines']>(draftState?.lines || []);
  // کلاس قیمت سفارش: پیش‌فرض از مشتری (ERP)، قابل تغییر؛ نام کلاس‌ها از ERP یا تعاریف پایه می‌آید.
  const priceClassLabels = resolvePriceClassLabels(orgConfig.priceClassLabels as Record<string, unknown> | undefined, state.externalProducts);
  const customerDefaultClass = (code: unknown) => (typeof code === 'string' && (PRICE_CLASS_CODES as readonly string[]).includes(code) ? code : undefined);
  const [priceClassCode, setPriceClassCode] = useState<string>(
    draftState?.priceClassCode || customerDefaultClass((visibleAccounts.find(a => a.id === defaultCustomerId) as Record<string, unknown> | undefined)?.priceClassCode) || PRICE_CLASS_CODES[0]
  );
  const handleCustomerChange = (id: ID) => {
    setSelectedCustomerId(id);
    const cls = customerDefaultClass((visibleAccounts.find(a => a.id === id) as Record<string, unknown> | undefined)?.priceClassCode);
    if (cls) handlePriceClassChange(cls);
  };
  // کلاس قیمت در سطح کل پیش‌فاکتور است؛ تغییر آن مرجع ERP همه اقلام را هم‌زمان تازه می‌کند.
  const handlePriceClassChange = (code: string) => {
    if (!(PRICE_CLASS_CODES as readonly string[]).includes(code)) return;
    setPriceClassCode(code);
    setLines(prev => prev.map(line => {
      const product = state.externalProducts.find(p => p.id === line.productId);
      const classPrice = product?.priceClasses?.[code as keyof NonNullable<typeof product.priceClasses>]?.unitPrice ?? null;
      return { ...line, erpClassUnitPrice: classPrice, erpClassCurrencyCode: product?.priceClasses?.[code as keyof NonNullable<typeof product.priceClasses>]?.currencyCode ?? product?.currencyCode ?? null, floorUnitPrice: product?.floorPrice ?? null };
    }));
  };

  const [discountPercent, setDiscountPercent] = useState(draftState?.discountPercent || '0');
  const [applyTax, setApplyTax] = useState(draftState?.applyTax ?? true);
  const [paymentTerms, setPaymentTerms] = useState(draftState?.paymentTerms ?? (typeof orgConfig.defaultQuotePaymentTerms === 'string' ? orgConfig.defaultQuotePaymentTerms : ''));
  const [deliveryTerms, setDeliveryTerms] = useState(draftState?.deliveryTerms ?? (typeof orgConfig.defaultQuoteDeliveryTerms === 'string' ? orgConfig.defaultQuoteDeliveryTerms : ''));
  const [quoteNotes, setQuoteNotes] = useState(draftState?.quoteNotes || '');

  const [createdQuote, setCreatedQuote] = useState<Quote | null>(null);

  useEffect(() => {
    if (isOpen && step < 4) {
      const timeout = setTimeout(() => {
        updateState(draft => {
          draft.draftQuote = {
            step, selectedCustomerId, projectTitle, validUntilDays, lines, priceClassCode,
            discountPercent, applyTax, paymentTerms, deliveryTerms, quoteNotes
          };
        });
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [step, selectedCustomerId, projectTitle, validUntilDays, lines, priceClassCode, discountPercent, applyTax, paymentTerms, deliveryTerms, quoteNotes, isOpen, updateState]);

  if (!isOpen) return null;

  const selectedCustomer = visibleAccounts.find(a => a.id === selectedCustomerId);
  const customerOptions: SelectOption[] = visibleAccounts.map(account => ({ value: account.id, label: account.name, subLabel: [account.code, account.city, account.phone].filter(Boolean).join(' · '), keywords: [account.address, account.nationalId].filter(Boolean).join(' ') }));

  // تراز نسبت به کلاس قیمت منتخب — منبع واحد: cpqEngine.computeOrderBalance (همان منطق نوار زندهٔ مرحلهٔ اقلام)
  const orderBalance = computeOrderBalance(lines.map((l, i) => lineToBalanceInput(l, String(i))));
  const invalidPricingLine = lines.some(l => !Number.isSafeInteger(l.quantity) || l.quantity <= 0 || !Number.isSafeInteger(l.unitPrice) || l.unitPrice <= 0);
  const negativeBalance = orderBalance.state === 'NEGATIVE';
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const knownCostLines = lines.filter(line => Number.isFinite(line.costPrice) && line.costPrice > 0);
  const costsComplete = lines.length > 0 && knownCostLines.length === lines.length;
  const totalCost = knownCostLines.reduce((sum, l) => sum + (l.costPrice * l.quantity), 0);
  const discountNumber = Number(discountPercent);
  const discountValid = Number.isFinite(discountNumber) && discountNumber >= 0 && discountNumber <= 100;
  const discountVal = (subtotal * (discountValid ? discountNumber : 0)) / 100;
  const taxableAmount = Math.max(0, subtotal - discountVal);
  // مالیات هر سطر با نرخ همان کالا از ERP؛ نرخ سازمانی فقط جایگزین کالای بدون نرخ است.
  const taxResult = computeQuoteTax(lines, discountVal, new Map((state.externalProducts || []).map(p => [p.id, p])), configuredTaxRate);
  const taxKnown = taxResult.amount !== null;
  const taxVal = applyTax && taxResult.amount !== null ? taxResult.amount : 0;
  const grandTotal = taxableAmount + taxVal;
  const grossProfit = costsComplete ? taxableAmount - totalCost : null;
  const marginPercent = grossProfit !== null && taxableAmount > 0 ? Math.round((grossProfit / taxableAmount) * 1000) / 10 : 0;

  const notifyInvalidLine = () => {
    updateState(draft => {
      if (!draft.notifications) draft.notifications = [];
      draft.notifications.push({
        id: generateId(), title: 'مقادیر قلم نامعتبر است',
        message: 'تعداد باید عدد صحیح مثبت و قیمت واحد باید مبلغ معتبر بزرگ‌تر از صفر باشد. مقدار نامعتبر با پیش‌فرض جایگزین نشد.',
        type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'quotes'
      });
    });
  };

  const handleFinishAndCreate = async () => {
    if (creationBusy.current) return;
    if (!guard(state, updateState, 'quotes', 'CREATE', 'صدور پیش‌فاکتور')) return;
    if (!selectedCustomerId || !visibleAccounts.some(account => account.id === selectedCustomerId) || lines.length === 0) return;
    if (invalidPricingLine || lines.some(line => !line.erpClassCurrencyCode) || orderBalance.currencyMismatch) { notifyInvalidLine(); return; }
    if (!discountValid) {
      updateState(draft => { if (!draft.notifications) draft.notifications = []; draft.notifications.push({ id: generateId(), title: 'درصد تخفیف نامعتبر است', message: 'درصد تخفیف باید عددی بین صفر تا صد باشد.', type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'quotes' }); });
      return;
    }
    if (applyTax && !taxKnown) {
      updateState(draft => { if (!draft.notifications) draft.notifications = []; draft.notifications.push({ id: generateId(), title: 'نرخ مالیات تعریف نشده است', message: 'نرخ مالیات دست‌کم یک کالا از ERP نیامده است؛ نرخ کالا را در تعریف کالا از ERP بگیرید یا نرخ جایگزین را در تنظیمات تعریف کنید. نرخ فرضی اعمال نشد.', type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'settings' }); });
      return;
    }
    if (validUntilDays.trim() !== '' && (!Number.isInteger(Number(validUntilDays)) || Number(validUntilDays) <= 0)) {
      updateState(draft => { if (!draft.notifications) draft.notifications = []; draft.notifications.push({ id: generateId(), title: 'مدت اعتبار نامعتبر است', message: 'مدت اعتبار باید خالی یا عددی بزرگ‌تر از صفر باشد.', type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'quotes' }); });
      return;
    }
    if (!state.currentUserId) return;
    // هشدار تراز منفی/کف نامعلوم هنگام ذخیره؛ ثبت پیش‌نویس مجاز است ولی تأیید خودکار نمی‌شود.
    if (negativeBalance || orderBalance.excludedLineCount > 0) {
      const parts = [
        negativeBalance ? `اختلاف سفارش با کلاس قیمت منتخب منفی است (کسری ${formatNumber(Math.abs(orderBalance.total))} ${orderBalance.currencyCode || 'واحد پول نامشخص'}).` : '',
        orderBalance.excludedLineCount > 0 ? `${formatNumber(orderBalance.excludedLineCount)} قلم قیمت کلاس منتخب ندارد و در تراز لحاظ نشده است.` : '',
        'پیش‌فاکتور برای بررسی/تأیید ثبت می‌شود. ادامه می‌دهید؟'
      ].filter(Boolean);
      if (!confirm(parts.join('\n'))) return;
    }
    const newId = generateId();
    const newQuoteNum = nextSequenceNumber('QT-', (state.quotes || []).map(x => x.quoteNumber), 1001);
    const creator = state.users.find(user => user.id === state.currentUserId);

    const provider=getActiveDataProvider();
    const remote=provider.name==='SQLSERVER_BACKEND';
    const engine=dataSyncController.getEngine();
    let finalQuote: Quote = {
      id: newId,
      quoteNumber: newQuoteNum,
      accountId: selectedCustomerId,
      customerId: selectedCustomerId,
      ownerId: state.currentUserId,
      branchId: creator?.branchId,
      territoryId: creator?.territoryId,
      teamId: creator?.teamId,
      tenantId: creator?.tenantId,
      status: remote ? 'DRAFT' : !costsComplete || negativeBalance || marginPercent < (state.settings?.quoteApprovalMarginThreshold || 15) ? 'PENDING_APPROVAL' : 'APPROVED',
      lines: lines.map(l => ({
        id: generateId(),
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        costPrice: l.costPrice,
        lineTotal: l.lineTotal,
        // اسنپ‌شات تراز: تغییر بعدی قیمت ERP تاریخچهٔ این سفارش را عوض نمی‌کند.
        erpClassUnitPrice: l.erpClassUnitPrice ?? null,
        floorUnitPrice: l.floorUnitPrice ?? null,
        cartonQuantity: l.cartonQuantity ?? null,
        unitsPerCarton: l.unitsPerCarton ?? null,
        lineVariance: l.lineVariance ?? null,
        balanceStatus: l.balanceStatus
      })),
      currencyCode: orderBalance.currencyCode || undefined,
      priceClassCode,
      orderBalance: orderBalance.state === 'UNKNOWN' ? null : orderBalance.total,
      orderBalanceState: orderBalance.state,
      totalAmount: grandTotal,
      marginPercent,
      marginCompleteness: costsComplete ? 'KNOWN' : knownCostLines.length ? 'PARTIAL' : 'UNKNOWN',
      validUntil: validUntilDays.trim() ? new Date(Date.now() + Number(validUntilDays) * 86400000).toISOString().slice(0, 10) : undefined,
      notes: [projectTitle.trim() ? `عنوان: ${projectTitle.trim()}` : '', paymentTerms.trim() ? `شرایط پرداخت: ${paymentTerms.trim()}` : '', deliveryTerms.trim() ? `تحویل: ${deliveryTerms.trim()}` : '', quoteNotes.trim() ? `توضیحات: ${quoteNotes.trim()}` : ''].filter(Boolean).join(' | '),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (remote) {
      const key=JSON.stringify([state.currentUserId,selectedCustomerId,priceClassCode,lines,projectTitle,paymentTerms,deliveryTerms,quoteNotes,validUntilDays,grandTotal]);
      const pending=creationAttempt.current?.key===key ? creationAttempt.current.quote : finalQuote;
      creationAttempt.current={key,quote:pending};
      creationBusy.current=true;
      setCreating(true);
      try {
        finalQuote=await provider.createQuote(pending);
        if (finalQuote?.id!==pending.id) throw new Error('رسید ثبت پیش‌فاکتور دریافت نشد.');
        if (engine!==dataSyncController.getEngine()) return;
        if (!engine?.acknowledgeRecord('quotes',finalQuote)) await dataSyncController.retrieveFromSqlServer();
        creationAttempt.current=null;
      } catch (cause) {
        toast.warning(cause instanceof Error ? cause.message : 'ثبت پیش‌فاکتور ممکن نشد.');
        return;
      } finally {
        creationBusy.current=false;
        setCreating(false);
      }
    }
    updateState(draft => {
      if (!draft.quotes) draft.quotes = [];
      if (!remote) draft.quotes = [finalQuote,...draft.quotes.filter(quote=>quote.id!==finalQuote.id)];
      draft.activeContextAccountId = selectedCustomerId;
      draft.draftQuote = null;
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(),
        action: 'QUOTE_CREATED',
        entityType: 'QUOTE',
        entityId: finalQuote.id,
        details: `پیش‌فاکتور ${finalQuote.quoteNumber} ثبت شد`,
        actor: state.users?.find(u => u.id === state.currentUserId)?.name || 'System',
        createdAt: new Date().toISOString()
      });
    });

    setCreatedQuote(finalQuote);
    setStep(4);
    if (onQuoteCreated) onQuoteCreated(finalQuote.id);
  };

  const handleClearDraft = () => {
    if (!guard(state, updateState, 'quotes', 'CREATE', 'پاک‌کردن پیش‌نویس')) return;
    if(confirm('آیا از پاک کردن اطلاعات پیش‌نویس اطمینان دارید؟')) {
      updateState(draft => { draft.draftQuote = null; });
      setStep(1);
      setLines([]);
      setProjectTitle('');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={()=>{if(!creating)onClose();}}
      title="ویزارد صدور پیش‌فاکتور رسمی (پیکربندی و قیمت‌گذاری)"
      subtitle={`مرحله ${step} از ۴`}
      size="xl"
      footer={
        step < 4 ? (
          <div className="flex justify-between items-center w-full">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleClearDraft} className="text-danger hover:bg-danger-soft">
                <Trash2 size={16} className="ml-1" /> پاک کردن پیش‌نویس
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={step === 1 || creating} onClick={() => setStep(s => (s - 1) as Record<string, unknown>)}>
                <ChevronRight size={16} className="ml-1" /> مرحله قبل
              </Button>
              {step < 3 ? (
                <Button variant="primary" size="sm" onClick={() => setStep(s => (s + 1) as Record<string, unknown>)}>
                  مرحله بعد <ChevronLeft size={16} className="mr-1" />
                </Button>
              ) : (
                <Button variant="primary" size="sm" loading={creating} onClick={handleFinishAndCreate} className="bg-primary hover:bg-primary-hover">
                  <FileText size={16} className="ml-1" /> ثبت پیش‌فاکتور
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={onClose}>اتمام و بازگشت</Button>
        )
      }
    >
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          {[
            { num: 1, label: 'مشتری و پروژه' },
            { num: 2, label: 'اقلام و متراژ' },
            { num: 3, label: 'شرایط و مارجین' },
            { num: 4, label: 'صدور و چاپ' }
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s.num ? 'bg-primary text-white shadow-sm' : step > s.num ? 'bg-primary/10 text-primary' : 'bg-canvas text-text-secondary'}`}>
                {step > s.num ? '✓' : s.num}
              </div>
              <span className={`text-xs font-bold hidden sm:inline ${step === s.num ? 'text-text-main' : 'text-text-secondary'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-text-main mb-1.5">انتخاب طرف حساب / مشتری سازمانی *</label>
              <SearchableSelect options={customerOptions} value={selectedCustomerId} onChange={handleCustomerChange}
                placeholder="انتخاب مشتری از فهرست مجاز" searchPlaceholder="نام، کد، شهر یا شماره تماس مشتری..." emptyText="مشتری مجازی مطابق جست‌وجو پیدا نشد" ariaLabel="جست‌وجوی مشتری" />
            </div>
            {selectedCustomer && (
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-main">اطلاعات حساب:</span>
                  <span className="text-primary font-bold">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>سقف اعتبار مالی:</span>
                  <span className="font-mono font-bold text-text-main">{formatMoney(selectedCustomer.creditLimit || 0, selectedCustomer.currencyCode || 'واحد پول نامشخص')}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>آدرس و نشانی تحویل:</span>
                  <span className="truncate max-w-(--size-280)">{selectedCustomer.address || 'ثبت نشده'}</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-text-main mb-1.5">عنوان پروژه / فرصت تجاری</label>
                <InputControl aria-label="عنوان پروژه / فرصت تجاری" type="text" placeholder="مثال: فاز دوم پروژه اداری تجاری وزرا" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}  />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-main mb-1.5">اعتبار پیش‌فاکتور (روز، اختیاری)</label>
                <InputControl aria-label="اعتبار پیش‌فاکتور (روز، اختیاری)" type="number" min="1" value={validUntilDays} onChange={(e) => setValidUntilDays(e.target.value)}  placeholder="بدون انقضا" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <QuotePricingStep
            products={state.externalProducts || []}
            priceClassLabels={priceClassLabels}
            priceClassCode={priceClassCode}
            onPriceClassChange={handlePriceClassChange}
            lines={lines}
            setLines={setLines}
            onInvalidAdd={notifyInvalidLine}
          />
        )}

        {step === 3 && (
          <div className="space-y-4">
            <OrderBalanceBar balance={orderBalance} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-text-main mb-1.5">تخفیف کلی (درصد)</label>
                <div className="relative">
                  <InputControl aria-label="تخفیف کلی (درصد)" type="number" min="0" max="100" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)}  />
                  <Percent size={14} className="absolute left-3 top-3 text-text-secondary" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-text-main mb-1.5">مالیات بر ارزش افزوده</label>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox id="applyTax" checked={applyTax} disabled={!taxKnown} onChange={(e) => setApplyTax(e.target.checked)} className="w-4" />
                  <label htmlFor="applyTax" className="text-xs font-bold text-text-main cursor-pointer">{!taxKnown ? 'نرخ مالیات کالا نامشخص است' : `اعمال مالیات به‌تفکیک نرخ کالا (${taxResult.byRate.map(r => `${formatNumber(r.rate)}٪`).join('، ') || '—'})`}</label>
                </div>
                {!taxKnown && lines.length > 0 && <p className="mt-1 text-micro text-warning">نرخ فرضی اعمال نمی‌شود؛ نرخ مالیات این کالا(ها) از ERP نیامده است.</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-text-main mb-1.5">شرایط تسویه</label>
                <InputControl aria-label="شرایط تسویه" type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}  />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-main mb-1.5">شرایط تحویل</label>
                <InputControl aria-label="شرایط تحویل" type="text" value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)}  />
              </div>
            </div>
            <div className="bg-text-main text-white rounded-2xl p-4 space-y-3">
              <span className="text-xs font-bold text-accent flex items-center gap-1.5">
                <ShieldCheck size={16} /> تحلیل مالی و حاشیه سود
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white/10 p-2.5 rounded-xl">
                  <div className="text-micro text-white/60 mb-0.5">مبلغ خام</div>
                  <div className="text-xs font-bold font-mono">{formatNumber(subtotal)}</div>
                </div>
                <div className="bg-white/10 p-2.5 rounded-xl">
                  <div className="text-micro text-white/60 mb-0.5">تخفیف</div>
                  <div className="text-xs font-bold font-mono text-status-risk">{formatNumber(discountVal)}</div>
                </div>
                <div className="bg-white/10 p-2.5 rounded-xl">
                  <div className="text-micro text-white/60 mb-0.5">ارزش افزوده</div>
                  <div className="text-xs font-bold font-mono text-status-warning">{formatNumber(taxVal)}</div>
                </div>
                <div className="bg-primary/20 border border-primary/50 p-2.5 rounded-xl">
                  <div className="text-micro text-accent mb-0.5">مبلغ نهایی</div>
                  <div className="text-sm font-extrabold font-mono text-white">{formatMoney(grandTotal, orderBalance.currencyCode || 'واحد پول نامشخص')}</div>
                </div>
              </div>
              <div className="flex items-center justify-between bg-white/10 p-2.5 rounded-xl" data-testid="summary-balance">
                <span className="text-micro text-white/70">تراز کل نسبت به کلاس قیمت منتخب</span>
                <span className="text-xs font-extrabold font-mono" dir="ltr"><bdi>{orderBalance.state === 'UNKNOWN' ? '—' : `${formatSignedAmount(orderBalance.total)} ${orderBalance.currencyCode || 'واحد پول نامشخص'}`}</bdi></span>
              </div>
            </div>
          </div>
        )}

        {step === 4 && createdQuote && (
          <div className="space-y-4">
            <div className="bg-success-soft border border-success-line rounded-2xl p-4 text-center space-y-2">
              <div className="w-12 h-12 bg-success text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold text-success">پیش‌فاکتور رسمی با موفقیت صادر شد!</h3>
              <p className="text-xs text-text-secondary">شماره پیگیری: <span className="font-mono font-bold text-text-main">{createdQuote.quoteNumber}</span></p>
            </div>
            <div className="border border-border rounded-2xl p-4 bg-canvas max-h-(--size-340) overflow-y-auto">
              <CustomerInvoicePrint quote={createdQuote} state={state} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
