import { getActiveDataProvider } from '../services/dataProvider';
import { guard, useCan } from '../hooks/useCan';
import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTabParam } from '../hooks/useTabParam';
import { buildAgingBuckets, normalizeAgingBounds, estimateLedgerAging, buildLedgerAgingInputs, estimateInvoiceRemaining } from '../services/agingBuckets';
import { getAgingBucketDays } from '../lib/metricConfig';
import { FINANCE_AREAS, areaOf } from '../lib/workspaceHierarchy';
import { AppState, Cheque, Payment, Invoice, CreditNoteRequest } from '../types';
import { summarizeCustomerLedgerReceivables } from '../lib/receivableReconciliation';
import { useDataQuery } from '../hooks/useDataProvider';
import { getPersianStatusLabel } from '../lib/labels';
import { Card } from './ui/Card';
import { ReceivablesLifoPanel } from './reports/ReceivablesLifoPanel';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Input, Select } from './ui/Input';
import { FinancialContextPanel, ContextToggle } from './shared/FinancialContextPanel';
import { checkFinanceRequest, buildFinanceRequest, decideFinanceRequest, FINANCE_KIND_LABEL, FINANCE_STATUS_LABEL, FinanceRequestKind, type FinanceRequestRecord } from '../lib/financeRequests';

interface FinanceScopeSource { accountId?: string; customerId?: string; ownerId?: string; requestedBy?: string; createdByUserId?: string; branchId?: string; territoryId?: string; teamId?: string; tenantId?: string }
interface ExpenseRecord extends FinanceScopeSource { id?: string; category?: string; amount?: number | string; deletedAt?: string | null }
interface FinanceSettingsView { orgConfig?: { allowManualFinanceEntry?: boolean; requireReceiptEvidence?: boolean; allowedCreditDays?: number | string | null }; agingBucketBounds?: unknown }
import { toLatinDigits } from '../lib/digits';
import { FINANCE_REQUEST_SCHEMA } from '../services/dynamicFormEngine';
import { DocumentField, DocFile } from './shared/DocumentField';
import { DocumentIntakeDrawer } from './shared/DocumentIntakeDrawer';
import { AttachmentManager } from './ui/AttachmentManager';
import { 
  Wallet, TrendingUp, AlertCircle, FileText, CheckCircle, Clock, 
  Plus, CheckCircle2, DollarSign, CreditCard, ShieldAlert, PhoneCall,
  CalendarCheck, AlertTriangle, ArrowUpRight, ShieldCheck, Check
} from 'lucide-react';
import { generateId, formatAppDate, nextSequenceNumber, toLocalDateISO, formatCurrency } from '../lib/utils';
import { enqueueOptimisticMutation } from '../lib/optimisticMutation';
import { ProgressiveDisclosure } from './shared/ProgressiveDisclosure';
import { IntentSurface } from './shared/IntentSurface';
import { DemoTrustBanner, isAuthoritativeActionAllowed } from './shared/DemoTrustBanner';
import { CustomDatePicker } from './ui/CustomDatePicker';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { LineChart } from './charts/LineChart';
import { ProfitLossWidget } from './finance/ProfitLossWidget';
import { 
  evaluateAllCustomerCollections, 
  generateCollectionTaskForAccount, 
  CustomerCollectionProfile 
} from '../services/collectionEngine';
import { DOCUMENT_TYPE_LABELS, buildPaymentFormPrefill, type CapturedDocumentType, type IntakePrefillPayload } from '../lib/documentCapture';
import { checkReceipt, buildReceiptPayment, approveAndAllocate, markNeedsFix, transferToErp, RECEIPT_STATUS_LABEL } from '../lib/receiptFlow';
import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { COLLECTION_PROMISE_SCHEMA, createInvoiceFormSchema, createPaymentReceiptFormSchema, createChequeFormSchema, RECEIPT_METHOD_FIELDS } from '../services/dynamicFormEngine';
import { VerdictStrip } from './shared/VerdictStrip';

// Contract Audit Markers: CREDIT_NOTE_REQUEST_DRAFT_CREATED CREDIT_NOTE_REQUEST_${next} تأیید مستقل آمادهٔ ورود در ERP؛ ثبت مالی انجام نشده
interface FinanceWorkspaceProps {
  state: AppState;
  updateState?: (updater: (draft: AppState) => AppState | void) => void;
}

export function FinanceWorkspace({ state, updateState }: FinanceWorkspaceProps) {
  const { can, canOn, denied } = useCan(state, updateState);
  type FinanceView = 'overview' | 'invoices' | 'payments' | 'cheques' | 'collection' | 'requests' | 'expenses' | 'treasury' | 'credits';
  const financeViewIds = FINANCE_AREAS.flatMap(area => area.views.map(view => view.id)) as FinanceView[];
  const [activeTab, setLocalTab] = useTabParam<FinanceView>(financeViewIds, 'overview');
  const activeArea = areaOf(FINANCE_AREAS, activeTab);
  const [notice, setNotice] = useState<string | null>(null);

  const [showPromiseModal, setShowPromiseModal] = useState(false);
  const [selectedProfileForPromise, setSelectedProfileForPromise] = useState<CustomerCollectionProfile | null>(null);
  const [showAutoTaskModal, setShowAutoTaskModal] = useState(false);
  const [selectedProfileForTask, setSelectedProfileForTask] = useState<CustomerCollectionProfile | null>(null);
  const [autoTaskDueDate, setAutoTaskDueDate] = useState(new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]);
  const [autoTaskNote, setAutoTaskNote] = useState('');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payEvidence, setPayEvidence] = useState<DocFile | null>(null);
  const [showIntakeDrawer, setShowIntakeDrawer] = useState(false);
  const [intakeInitialType, setIntakeInitialType] = useState<CapturedDocumentType>('BANK_RECEIPT');
  const [paymentFormInitialValues, setPaymentFormInitialValues] = useState<Record<string, unknown>>({ method: 'TRANSFER' });
  const location = useLocation();
  const applyIntakeToForm = React.useCallback((payload: IntakePrefillPayload) => {
    const prefill = buildPaymentFormPrefill(payload);
    if (prefill) {
      setPaymentFormInitialValues(prefill.values);
      setShowPaymentModal(true);
      setNotice(prefill.notice);
    } else if (payload.documentType === 'INVOICE') {
      setNotice(`اطلاعات فاکتور استخراج شد: شماره ${payload.appliedValues.invoiceNumber || 'نامشخص'} - مبلغ: ${Number(payload.appliedValues.amount || 0).toLocaleString('fa-IR')} ریال.`);
    } else {
      setNotice(`اطلاعات سند ${DOCUMENT_TYPE_LABELS[payload.documentType]} استخراج شد.`);
    }
  }, []);
  // مقادیر OCR که Layout هنگام ناوبری حمل کرده است؛ یک‌بار مصرف می‌شود (پاک‌سازی state تا Refresh دوباره فرم را باز نکند)
  React.useEffect(() => {
    const carried = (location.state as { intakePrefill?: IntakePrefillPayload } | null)?.intakePrefill;
    if (!carried) return;
    applyIntakeToForm(carried);
    window.history.replaceState({ ...(window.history.state || {}), usr: null }, '');
  }, [location.state, applyIntakeToForm]);
  const manualEntry = (state.settings as unknown as FinanceSettingsView | undefined)?.orgConfig?.allowManualFinanceEntry === true;
  
  const getFinanceRecordScope = (record: FinanceScopeSource) => {
    const accountId = record.accountId || record.customerId;
    const account = (state.accounts || []).find(item => item.id === accountId);
    const owner = state.users.find(user => user.id === (record.ownerId || record.requestedBy || record.createdByUserId));
    return {
      ownerId: record.ownerId || account?.ownerId || owner?.id,
      branchId: record.branchId || account?.branchId || owner?.branchId,
      territoryId: record.territoryId || account?.territoryId || owner?.territoryId,
      teamId: record.teamId || account?.teamId || owner?.teamId,
      tenantId: record.tenantId || account?.tenantId || owner?.tenantId
    };
  };
  const financeRequests: FinanceRequestRecord[] = ((state.financeRequests || []) as FinanceRequestRecord[]).filter((request) =>
    !request.deletedAt && canOn('financeRequests', 'VIEW', getFinanceRecordScope(request))
  );

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showChequeModal, setShowChequeModal] = useState(false);

  const invoices = (state.invoices || []).filter(invoice => canOn('finance', 'VIEW', getFinanceRecordScope(invoice)));
  const payments = (state.payments || []).filter(payment => canOn('payments', 'VIEW', getFinanceRecordScope(payment)));
  const creditNotes: CreditNoteRequest[] = (state.creditNoteRequests || []).filter(note => canOn('finance', 'VIEW', getFinanceRecordScope(note)));

  const cheques: Cheque[] = (state.cheques || []).filter(cheque => canOn('finance', 'VIEW', getFinanceRecordScope(cheque)));
  const expenses: ExpenseRecord[] = (((state as unknown as { expenses?: ExpenseRecord[] }).expenses) || []).filter((expense) => !expense.deletedAt && canOn('finance', 'VIEW', getFinanceRecordScope(expense)));
  const today = toLocalDateISO();
  // F0-16: مطالبات = Σبدهکار − Σبستانکار دفتری هر تفصیلی×معین از مسیر DataProvider (نه فاکتور/صورتحساب باز).
  // بدون مجوز مالی اصلاً درخواست نمی‌شود؛ سررسید/Aging فقط با تخصیص اسناد معتبر ERP (authoritative) و در غیر این صورت «نامشخص».
  const canSeeLedger = can('finance', 'VIEW');
  const ledgerAccounts = (state.accounts || []).filter(account => canOn('finance', 'VIEW', getFinanceRecordScope({ accountId: account.id })));
  const ledgerLineCount = Array.isArray(state.journalLines) ? state.journalLines.length : 0;
  const { data: ledgerBalances, error: ledgerError, loading: ledgerLoading, refetch: refreshLedgerBalances } = useDataQuery(
    async provider => (canSeeLedger ? provider.getDetailSubsidiaryBalances() : null),
    [canSeeLedger, ledgerLineCount]
  );
  // F0-14: a failed provider request is UNAVAILABLE, never a perpetual LOADING state.
  const ledgerResult = canSeeLedger
    ? (ledgerError ? { status: 'UNAVAILABLE' as const, source: getActiveDataProvider().name, balances: [], reason: ledgerError.message } : ledgerBalances)
    : { status: 'EMPTY' as const, source: 'CLIENT_INDEXEDDB' as const, balances: [] };
  const ledgerReceivables = summarizeCustomerLedgerReceivables(ledgerResult, ledgerAccounts);
  const ledgerReceivablesText = ledgerReceivables.kind === 'OK' ? ledgerReceivables.debtorTotal.toLocaleString('fa-IR') : ledgerReceivables.kind === 'LOADING' && ledgerLoading ? '…' : 'نامشخص';
  // قاعدهٔ مالک: تخصیص دریافت↔فاکتور در CRM مبنای معتبر نیست (ERP آن را اعمال نمی‌کند و ترتیب تسویه از صورتحساب ثابت/قابل‌اثبات نیست) ⇒ سررسید/Aging تا تعریف سیاست مصوب «نامشخص» می‌ماند.
  const estimateInputs = canSeeLedger ? buildLedgerAgingInputs(ledgerBalances, ledgerAccounts, invoices) : [];
  const agingEstimate = estimateLedgerAging(estimateInputs, new Date());
  // مانده تخمینی هر فاکتور (LIFO از آخرین فاکتور به عقب؛ بدون تخصیص CRM)؛ null = نامشخص
  const invoiceRemaining = canSeeLedger ? estimateInvoiceRemaining(ledgerBalances, ledgerAccounts, invoices) : new Map<string, number | null>();
  const hasEstimate = estimateInputs.length > 0;
  const totalOverdue = hasEstimate ? agingEstimate.items.filter(i => i.days > 0).reduce((sum, i) => sum + i.amount, 0) : null;

  const rawAging = (state.settings as unknown as FinanceSettingsView | undefined)?.agingBucketBounds;
  const agingBounds = normalizeAgingBounds(
    (rawAging as Parameters<typeof normalizeAgingBounds>[0]) ||
    (getAgingBucketDays(state.settings) as unknown as Parameters<typeof normalizeAgingBounds>[0])
  );
  const aging = buildAgingBuckets(agingEstimate.items, agingBounds);
  const agingMatchesTotal = hasEstimate && aging.balanced;

  const openCheques = cheques.filter(c => ['PENDING', 'RECEIVED', 'DEPOSITED'].includes(c.status));
  const payableCheques = cheques.filter(c => c.direction === 'PAYABLE');
  const upcomingPayableCheques = payableCheques.filter(c => c.status !== 'CLEARED' && c.dueDate && c.dueDate >= today && c.dueDate <= toLocalDateISO(new Date(Date.now() + 7 * 86400000)));

  const collectionScopeState = {
    ...state,
    accounts: (state.accounts || []).filter(account => canOn('finance', 'VIEW', getFinanceRecordScope({ accountId: account.id }))),
    invoices,
    payments,
    cheques
  } as AppState;
  const collectionData = evaluateAllCustomerCollections(collectionScopeState, new Date(), canSeeLedger ? ledgerBalances : null);

  const expenseCenterData = useMemo(() => {
    const centers: Record<string, number> = {
      'انبار و لجستیک': 0,
      'پرسنلی و حقوق': 0,
      'بازاریابی و فروش': 0,
      'تولید و نگهداری': 0,
      'عمومی و اداری': 0
    };
    expenses.forEach((e) => {
      const cat = e.category || 'عمومی و اداری';
      if (centers[cat] !== undefined) centers[cat] += Math.max(0, Number(e.amount) || 0);
      else centers['عمومی و اداری'] += Math.max(0, Number(e.amount) || 0);
    });
    const colors = [
      'var(--c-chart-1)',
      'var(--c-chart-2)',
      'var(--c-chart-3)',
      'var(--c-chart-4)',
      'var(--c-chart-5)'
    ];
    return Object.entries(centers).map(([name, value], i) => ({
      name,
      value,
      fill: colors[i % colors.length]
    }));
  }, [expenses]);

  const handleCreatePayment = (values: Record<string, unknown>) => {
    if (!can('payments', 'CREATE')) return denied('ثبت پرداخت');
    if (!updateState) return;
    const rawMethod = String(values.method || 'TRANSFER');
    const sayad = toLatinDigits(String(values.sayadId || '')).replace(/\s/g, '');
    if (rawMethod === 'CHEQUE' && !/^\d{16}$/.test(sayad)) { setNotice('شناسهٔ صیاد باید ۱۶ رقم باشد.'); setTimeout(() => setNotice(null), 6000); return; }
    // کارتخوان با اطلاعات کانال به‌صورت «نقدی» ذخیره می‌شود تا ساختار فعلی پرداخت‌ها نشکند.
    const storedMethod = rawMethod === 'CARD_READER' ? 'CASH' : rawMethod;
    const referenceValue = rawMethod === 'CHEQUE' ? sayad : rawMethod === 'CASH' ? String(values.receiptNo || '') : String(values.reference || '');
    const input = { accountId: values.accountId, amount: Number(toLatinDigits(String(values.amount ?? '')).replace(/[^\d.]/g, '')), method: storedMethod, reference: referenceValue, bankName: values.bankName, submittedBy: state.currentUserId };
    const channelExtras: Record<string, unknown> = { channel: rawMethod };
    for (const key of RECEIPT_METHOD_FIELDS[rawMethod] || []) { const v = values[key]; if (v !== undefined && v !== null && String(v).trim() !== '' && !['bankName', 'reference'].includes(key)) channelExtras[key] = typeof v === 'string' ? v.trim() : v; }
    const requireEvidence = (state.settings as unknown as FinanceSettingsView | undefined)?.orgConfig?.requireReceiptEvidence !== false;
    const check = checkReceipt(state, { ...input, requireEvidence, hasEvidence: !!payEvidence });
    if (!check.ok) { setNotice(check.errors.join(' ')); setTimeout(() => setNotice(null), 6000); return; }
    const newPayment = { ...buildReceiptPayment(input, generateId(), new Date(), check.probableDuplicateOf), ...channelExtras };
    updateState(draft => {
      if (!draft.payments) draft.payments = [];
      draft.payments.unshift(newPayment as Payment);
    });
    void enqueueOptimisticMutation({
      action: 'CREATE',
      entityType: 'payments',
      entityId: (newPayment as Payment).id,
      payload: { ...(newPayment as object) },
      alwaysQueue: true,
    });
    setShowPaymentModal(false); setPayEvidence(null);
    setNotice(`رسید به مبلغ ${Number(values.amount).toLocaleString('fa-IR')} ریال ثبت شد و در انتظار بررسی حسابداری است.`);
    setTimeout(() => setNotice(null), 5000);
  };

  return (
    <main className="crm-page crm-page-finance w-full min-w-0 flex-1 overflow-y-auto bg-transparent px-2 py-2 sm:px-4 sm:py-3 space-y-3 pb-[calc(6rem+env(safe-area-inset-bottom))]" dir="rtl" aria-label="مرکز مالی و خزانه‌داری">
      {notice && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <IntentSurface state={state} maxItems={2} />
      <DemoTrustBanner state={state} surface="finance" />

      {/* هدر بخش مالی */}
      <section className="crm-workspace-heading flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-xs">
        <div>
          <div className="text-micro font-bold text-primary">امور مالی و خزانه‌داری</div>
          <h1 data-tour-heading className="text-sm sm:text-base font-bold text-text-main tracking-tight">{activeArea.title}</h1>
          <p className="text-caption text-text-secondary mt-0.5">{activeArea.subtitle}</p>
        </div>
        
        {updateState && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="soft" size="sm" onClick={() => { setIntakeInitialType('BANK_RECEIPT'); setShowIntakeDrawer(true); }} title="عکس‌برداری و استخراج فیش، چک یا فاکتور با هوش مصنوعی" >
              <Sparkles size={14} /> اسکن هوشمند مدرک
            </Button>
            <Button variant="primary" size="sm" onClick={() => { setPaymentFormInitialValues({ method: 'TRANSFER' }); setShowPaymentModal(true); }} >
              <Plus size={13} /> ثبت دریافتی / حواله
            </Button>
            {manualEntry && (
              <Button variant="outline" size="sm" onClick={() => setShowInvoiceModal(true)} >
                <Plus size={13} /> فاکتور دستی
              </Button>
            )}
          </div>
        )}
      </section>

      {/* نوار حکم ۸ ثانیه‌ای مالی */}
      <VerdictStrip
        verdict={totalOverdue === null ? 'سررسید مطالبات نامشخص است؛ مانده بدهکار یا فاکتور ERP برای تخمین موجود نیست' : totalOverdue > 0 ? `حدود ${(totalOverdue).toLocaleString('fa-IR')} ریال از مطالبات (تخمینی) سررسیدگذشته است` : `وضعیت تسویه و وصولی‌ها در شرایط مطلوب قرار دارد`}
        magnitude={`کل مطالبات دفتری: ${ledgerReceivablesText}${ledgerReceivables.kind === 'OK' ? ' ریال' : ''}`}
        tone={totalOverdue === null ? 'warning' : totalOverdue > 0 ? 'warning' : 'success'}
        actionLabel="بررسی مطالبات"
        onAction={() => setLocalTab('collection')}
      />

      {/* کارت‌های شاخص‌های کلیدی مالی با شناسه پایدار تور */}
      <div id="fin-kpis" data-tour-primary className="crm-kpi-grid grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-text-secondary text-xs font-medium">
            <Wallet size={14} className="text-primary" />
            <span>کل مطالبات بازار</span>
          </div>
          <div className="text-base sm:text-lg font-bold text-text-main font-mono mt-1">{ledgerReceivablesText}</div>
          <span className="text-micro text-text-secondary">{ledgerReceivables.kind === 'OK' ? (ledgerReceivables.incomplete ? 'ریال — ناقص: بخشی فاقد نگاشت معین' : 'ریال') : ledgerReceivables.kind === 'UNAVAILABLE' ? 'منبع گردش در دسترس نیست' : ledgerReceivables.kind === 'NO_LEDGER' ? 'گردش مالی ثبت نشده' : ''}{canSeeLedger && ledgerError && <button type="button" className="ms-2 underline" onClick={() => void refreshLedgerBalances()}>تلاش مجدد</button>}</span>
        </Card>

        <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-danger text-xs font-medium">
            <AlertCircle size={14} />
            <span>معوقات سررسیدشده</span>
          </div>
          <div className="text-base sm:text-lg font-bold text-danger font-mono mt-1">{totalOverdue === null ? 'نامشخص' : totalOverdue.toLocaleString('fa-IR')}</div>
          <span className="text-micro text-text-secondary">{totalOverdue === null ? 'مانده/فاکتور موجود نیست' : 'ریال — تخمینی'}</span>
        </Card>

        <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-warning text-xs font-medium">
            <CreditCard size={14} />
            <span>چک‌های در جریان وصول</span>
          </div>
          <div className="text-base sm:text-lg font-bold text-warning font-mono mt-1">{openCheques.length} فقره</div>
          <span className="text-micro text-text-secondary font-mono">{openCheques.reduce((sum, c) => sum + c.amount, 0).toLocaleString('fa-IR')} ریال</span>
        </Card>

        <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-text-secondary text-xs font-medium">
            <Clock size={14} />
            <span>سررسید پرداخت ۷ روزه</span>
          </div>
          <div className="text-base sm:text-lg font-bold text-text-main font-mono mt-1">{upcomingPayableCheques.length} فقره</div>
          <span className="text-micro text-text-secondary font-mono">{upcomingPayableCheques.reduce((sum, c) => sum + Number(c.amount || 0), 0).toLocaleString('fa-IR')} ریال</span>
        </Card>
      </div>

      {/* گزارش سنی مطالبات (Aging) — Progressive Disclosure 2026 */}
      {(activeTab === 'overview' || activeTab === 'collection') && (
        <div id="fin-aging" data-tour-primary>
          <ProgressiveDisclosure
            defaultOpen={activeTab === 'collection'}
            summary={
              <div className="flex items-center justify-between gap-3 w-full pe-1">
                <span className="text-xs font-bold text-text-main">گزارش سنی مطالبات تجاری</span>
                <span className={!hasEstimate ? 'text-micro text-text-secondary font-bold' : agingMatchesTotal ? 'text-micro text-warning font-bold' : 'text-micro text-danger font-bold'}>
                  {!hasEstimate ? 'نامشخص' : agingMatchesTotal ? 'تخمینی' : 'مغایرت کنترلی'}
                </span>
              </div>
            }
          >
            <p className="text-micro text-text-secondary mb-2">
              {hasEstimate
                ? `تخمینی: مانده دفتری هر مشتری از آخرین فاکتور به عقب پوشش داده می‌شود؛ تخصیص CRM استفاده نشده.${agingEstimate.unattributed > 0 ? ` مبلغ بدون فاکتور/سررسید مرتبط (خارج از بازه‌ها): ${agingEstimate.unattributed.toLocaleString('fa-IR')} ریال.` : ''}`
                : ledgerReceivables.kind === 'OK' && ledgerReceivables.debtorCount > 0 ? 'مانده بدهکار دفتری هست ولی فاکتور ERP قابل‌انتساب برای این مشتریان در دسترس نیست.' : 'نامشخص: مشتری دارای مانده بدهکار در دفتر مالی نیست یا گردش مالی هنوز دریافت نشده است.'}
            </p>
            {agingEstimate.customers.length > 0 && (
              <div className="space-y-2 mb-3" data-testid="aging-customer-detail">
                {[...agingEstimate.customers].sort((x, y) => y.balance - x.balance).slice(0, 15).map(cust => (
                  <div key={cust.id} className="rounded-xl border border-border/80 p-2.5 text-start">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-text-main">
                      <span className="truncate">{cust.name || cust.id}</span>
                      <span className="font-mono text-danger">{cust.balance.toLocaleString('fa-IR')} ریال بدهکار</span>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {cust.covered.map((c, idx) => (
                        <li key={`${c.invoiceNumber}-${idx}`} className="flex items-center justify-between gap-2 text-micro text-text-secondary">
                          <span>{idx === 0 ? 'آخرین فاکتور' : 'فاکتور قبل'} {c.invoiceNumber || '—'} · {c.date || 'بدون تاریخ'}{c.days === null ? ' · سررسید نامشخص' : c.days > 0 ? ` · ${c.days.toLocaleString('fa-IR')} روز تأخیر` : ' · سررسیدنشده'}</span>
                          <span className="font-mono">{c.covered.toLocaleString('fa-IR')} از {c.invoiceTotal.toLocaleString('fa-IR')}</span>
                        </li>
                      ))}
                      {cust.covered.length === 0 && <li className="text-micro text-text-secondary">فاکتور ERP برای این مشتری موجود نیست</li>}
                      {cust.unattributed > 0 && cust.covered.length > 0 && <li className="text-micro text-warning">{cust.unattributed.toLocaleString('fa-IR')} ریال بدون فاکتور مرتبط</li>}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-center">
              {aging.buckets.map((bucket, index) => {
                const tone = index === 0 ? 'bg-canvas text-text-main' : index < aging.buckets.length - 2 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger';
                return (
                  <div key={bucket.key} className={`p-2.5 rounded-xl border border-border/80 ${tone}`}>
                    <div className="text-micro font-medium">{bucket.label}</div>
                    <div className="text-xs sm:text-sm font-bold font-mono mt-0.5">{hasEstimate ? bucket.amount.toLocaleString('fa-IR') : 'نامشخص'}</div>
                    <div className="text-tiny opacity-75 mt-0.5">{hasEstimate ? `${bucket.invoiceCount.toLocaleString('fa-IR')} فاکتور` : '—'}</div>
                  </div>
                );
              })}
            </div>
            {canSeeLedger && (
              <div className="mt-3">
                <ReceivablesLifoPanel
                  ledgerBalances={ledgerBalances}
                  accounts={ledgerAccounts}
                  invoices={invoices}
                  allowedDays={(state.settings as unknown as FinanceSettingsView | undefined)?.orgConfig?.allowedCreditDays}
                  agingBounds={agingBounds}
                  sellerName={key => (state.users || []).find(u => u.id === key)?.name || ''}
                  locale={state.settings?.locale}
                />
              </div>
            )}
          </ProgressiveDisclosure>
        </div>
      )}

      {activeTab === 'overview' && (
        <div id="fin-trend" data-tour-primary>
          <ProfitLossWidget state={state} />
        </div>
      )}

      {/* ناوبری مالی: چهار کانون کاری به‌جای ردیف بلند تب‌ها؛ زیرنماها در یک انتخابگر */}
      <section id="fin-tabs" data-tour-actions className="rounded-2xl border border-border/70 bg-surface p-2.5 shadow-xs space-y-2" aria-label="بخش‌های اصلی امور مالی">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
          {FINANCE_AREAS.map(area => {
            const selected = area.id === activeArea.id;
            const primaryView = area.views[0]?.id as FinanceView;
            const count = area.views.length;
            return (
              <button type="button" key={area.id} onClick={() => setLocalTab(primaryView)} aria-current={selected ? 'page' : undefined} className={`min-h-11 rounded-xl px-3 py-2 text-right transition-colors ${selected ? 'bg-primary text-on-primary shadow-sm' : 'bg-canvas/70 text-text-secondary hover:bg-primary/5 hover:text-text-main'}`}>
                <span className="block text-xs font-bold">{area.title}</span>
                <span className={`mt-0.5 block text-micro ${selected ? 'text-on-primary/75' : 'text-text-muted'}`}>{count === 1 ? 'نمای یکپارچه' : `${count.toLocaleString('fa-IR')} نمای مرتبط`}</span>
              </button>
            );
          })}
        </div>
        {activeArea.views.length > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-t border-border/60 pt-2">
            <label htmlFor="finance-subview" className="shrink-0 text-caption font-semibold text-text-secondary">نمای جزئی‌تر</label>
            <Select density="compact" id="finance-subview" value={activeTab} onChange={event => setLocalTab(event.target.value as FinanceView)}
              className="sm:max-w-sm">
              {activeArea.views.map(view => <option key={view.id} value={view.id}>{view.label}</option>)}
            </Select>
            <span className="text-micro text-text-muted">همه قابلیت‌ها حفظ شده‌اند؛ فقط مسیر دسترسی ساده‌تر شده است.</span>
          </div>
        )}
      </section>

      {/* لیست فاکتورها */}
      {activeTab === 'invoices' && (
        <div className="space-y-2">
          {invoices.map(inv => {
            const acc = (state.accounts || []).find(a => a.id === (inv as Invoice & { accountId?: string }).accountId || a.id === inv.customerId);
            const outstanding = invoiceRemaining.get(inv.id) ?? null;
            return (
              <div key={inv.id} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-text-main font-mono">{inv.invoiceNumber}</div>
                  {acc && <div className="text-caption text-text-secondary mt-0.5">{acc.name}</div>}
                  <div className="text-mini text-text-secondary mt-0.5 font-mono">سررسید: {formatAppDate(inv.dueDate, state.settings?.locale)}</div>
                </div>
                <div className="text-left font-mono">
                  <div className="text-xs font-bold text-text-main">{inv.totalAmount.toLocaleString('fa-IR')} ریال</div>
                  <div className="text-micro text-text-secondary mt-0.5">مانده (تخمینی): {outstanding === null ? 'نامشخص' : outstanding.toLocaleString('fa-IR')}</div>
                </div>
              </div>
            );
          })}
          {invoices.length === 0 && <div className="text-center text-xs text-text-secondary py-8 bg-surface rounded-xl border border-border">فاکتوری یافت نشد.</div>}
        </div>
      )}

      {/* دریافتی‌ها و خزانه‌داری */}
      {(activeTab === 'payments' || activeTab === 'treasury') && (
        <div className="space-y-2">
          {payments.map(pay => (
            <div key={pay.id} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center">
              <div>
                <div className="text-xs font-bold text-text-main font-mono">{(pay as Payment & { paymentNumber?: string }).paymentNumber || pay.reference || pay.id}</div>
                <div className="text-mini text-text-secondary mt-0.5">{pay.method}</div>
              </div>
              <div className="text-xs font-bold text-text-main font-mono">{pay.amount.toLocaleString('fa-IR')} ریال</div>
            </div>
          ))}
          {payments.length === 0 && <EmptyState surface="finance_workspace" title="دریافتی یافت نشد" description="یک دریافتی یا حواله جدید ثبت کنید." compact actionLabel="ثبت دریافتی" onAction={() => setShowPaymentModal(true)} />}
        </div>
      )}

      {/* چک‌ها */}
      {(activeTab === 'cheques' || activeTab === 'treasury') && (
        <div className="space-y-2">
          {cheques.map(c => (
            <div key={c.id} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center">
              <div>
                <div className="text-xs font-bold text-text-main font-mono">چک {c.chequeNumber}</div>
                <div className="text-mini text-text-secondary mt-0.5">بانک: {c.bankName} - وضعیت: {getPersianStatusLabel(c.status)}</div>
              </div>
              <div className="text-xs font-bold text-text-main font-mono">{c.amount.toLocaleString('fa-IR')} ریال</div>
            </div>
          ))}
          {cheques.length === 0 && <div className="text-center text-xs text-text-secondary py-8 bg-surface rounded-xl border border-border">چکی یافت نشد.</div>}
        </div>
      )}

      {/* دستورهای پرداخت و تسویه */}
      {(activeTab === 'requests' || activeTab === 'treasury') && (
        <div className="space-y-2">
          {financeRequests.map((req) => (
            <div key={req.id} className="p-3 bg-surface border border-border rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-text-main font-mono">{req.requestNumber || req.id}</div>
                  <div className="text-mini text-text-secondary mt-0.5">{FINANCE_KIND_LABEL[req.kind as FinanceRequestKind] || getPersianStatusLabel(req.kind)} - {FINANCE_STATUS_LABEL[req.status] || getPersianStatusLabel(req.status)}</div>
                  {req.accounting?.blocking && <div className="text-mini text-danger mt-0.5">تأیید نهایی مسدود است: {(req.accounting.reasons || []).join(' ') || 'نگاشت حسابداری معتبر نیست'}</div>}
                </div>
                <div className="text-xs font-bold text-text-main font-mono">{Number(req.amount || 0).toLocaleString('fa-IR')} ریال</div>
              </div>
              <ContextToggle label="سابقه، طبقه‌بندی و نگاشت حسابداری">
                <FinancialContextPanel approval={{ kind: 'FINANCE_REQUEST', id: req.id }} refreshKey={financeRequests.length} compact />
              </ContextToggle>
            </div>
          ))}
          {financeRequests.length === 0 && <div className="text-center text-xs text-text-secondary py-8 bg-surface rounded-xl border border-border">دستور پرداختی یافت نشد.</div>}
        </div>
      )}

      {/* اعلامیه‌های بستانکاری */}
      {activeTab === 'credits' && (
        <div className="space-y-2">
          {creditNotes.map(cn => (
            <div key={cn.id} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center">
              <div>
                <div className="text-xs font-bold text-text-main font-mono">{cn.requestNumber || cn.id}</div>
                <div className="text-mini text-text-secondary mt-0.5">دلیل: {cn.reason}</div>
              </div>
              <div className="text-xs font-bold text-text-main font-mono">{Number(cn.requestedAmount || 0).toLocaleString('fa-IR')} ریال</div>
            </div>
          ))}
          {creditNotes.length === 0 && <div className="text-center text-xs text-text-secondary py-8 bg-surface rounded-xl border border-border">درخواست بستانکاری ثبت نشده است.</div>}
        </div>
      )}

      {/* هزینه‌ها */}
      {activeTab === 'expenses' && (
        <div className="space-y-3.5">
          <Card padding="md" className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
              <div>
                <h2 className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  سهم مراکز هزینه در بودجه کلی (Cost Center Breakdown)
                </h2>
                <span className="text-mini text-text-secondary mt-0.5 block">
                  توزیع مخارج عملیاتی و سرمایه‌ای سازمان
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="h-56 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseCenterData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {expenseCenterData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(val: unknown) => [`${formatCurrency(Number(val))} ریال`, 'مبلغ']}
                      contentStyle={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', borderRadius: 'var(--c-radius-md)', fontSize: 'var(--font-size-caption)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {expenseCenterData.map((c, i) => {
                  const sum = expenseCenterData.reduce((a, b) => a + b.value, 0);
                  const pct = sum > 0 ? Math.round((c.value / sum) * 100) : 0;
                  return (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-canvas border border-border/70">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.fill }} />
                        <span className="font-medium text-text-main">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-text-secondary">{formatCurrency(c.value)} ریال</span>
                        <span className="font-bold text-primary text-micro bg-primary-soft/40 px-1.5 py-0.5 rounded">
                          {pct}٪
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* لیست هزینه‌ها */}
          <div className="space-y-2">
            {expenses.map(exp => (
              <div key={exp.id} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-text-main">{exp.title || exp.category || exp.id}</div>
                  <div className="text-mini text-text-secondary mt-0.5">وضعیت: {getPersianStatusLabel(exp.status)}</div>
                </div>
                <div className="text-xs font-bold text-text-main font-mono">{Number(exp.amount || 0).toLocaleString('fa-IR')} ریال</div>
              </div>
            ))}
            {expenses.length === 0 && <div className="text-center text-xs text-text-secondary py-8 bg-surface rounded-xl border border-border">هیچ سندی ثبت نشده است.</div>}
          </div>
        </div>
      )}

      {/* کارتابل مطالبات و وصول */}
      {activeTab === 'collection' && (
        <div className="space-y-2.5">
          <div className="space-y-2">
            {collectionData.profiles.map(p => (
              <div 
                key={p.accountId}
                className="p-3 bg-surface border border-border rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-bold text-text-main">{p.accountName}</strong>
                    <span className="px-1.5 py-0.2 rounded text-micro font-bold bg-danger-soft text-danger">
                      ریسک {p.riskScore}٪
                    </span>
                  </div>
                  <div className="text-caption text-text-secondary mt-1 flex items-center gap-3">
                    <span>مانده معوق: <strong className="font-mono text-danger">{p.overdueBalance.toLocaleString('fa-IR')} ریال</strong></span>
                    <span>تأخیر: {p.maxDaysOverdue} روز</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button variant="soft" size="xs" onClick={() => { setSelectedProfileForPromise(p); setShowPromiseModal(true); }} >
                    ثبت تعهد
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => { setSelectedProfileForTask(p); setAutoTaskNote(`پیگیری فوری مطالبات ${p.overdueBalance.toLocaleString('fa-IR')} ریال.`); setShowAutoTaskModal(true); }} >
                    پیگیری تقویم
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* مودال‌های عملیاتی */}
      {showPaymentModal && (
        <Modal isOpen={showPaymentModal} onClose={() => { setShowPaymentModal(false); setPayEvidence(null); }} title="ثبت رسید دریافتی و واریز">
          <DynamicFormRenderer
            schema={createPaymentReceiptFormSchema(state.accounts || [], [
              { value: 'TRANSFER', label: 'حواله بانکی' },
              { value: 'CARD_READER', label: 'کارتخوان' },
              { value: 'CHEQUE', label: 'چک صیادی' },
              { value: 'CASH', label: 'نقدی' }
            ])}
            initialValues={paymentFormInitialValues}
            onSubmit={handleCreatePayment}
            onCancel={() => setShowPaymentModal(false)}
            submitLabel="ثبت رسید"
          />
        </Modal>
      )}

      {showPromiseModal && selectedProfileForPromise && (
        <Modal 
          isOpen={showPromiseModal} 
          onClose={() => { setShowPromiseModal(false); setSelectedProfileForPromise(null); }} 
          title={`ثبت تعهد پرداخت: ${selectedProfileForPromise.accountName}`}
        >
          <DynamicFormRenderer
            schema={COLLECTION_PROMISE_SCHEMA}
            initialValues={{
              promisedAmount: selectedProfileForPromise.overdueBalance || undefined,
              promisedDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
              paymentMethod: 'TRANSFER',
              autoGenerateCalendarTask: true,
              contactPerson: selectedProfileForPromise.accountName
            }}
            onSubmit={(vals) => {
              setShowPromiseModal(false);
              setNotice('تعهد پرداخت با موفقیت ثبت شد.');
            }}
            onCancel={() => { setShowPromiseModal(false); setSelectedProfileForPromise(null); }}
            submitLabel="ثبت تعهد"
          />
        </Modal>
      )}

      {/* مودال ورود هوشمند اسناد با هوش مصنوعی (OCR) */}
      <DocumentIntakeDrawer
        isOpen={showIntakeDrawer}
        onClose={() => setShowIntakeDrawer(false)}
        state={state}
        updateState={updateState}
        initialType={intakeInitialType}
        onApplyToForm={({ documentType, result, appliedValues }) => applyIntakeToForm({ documentType, appliedValues, fileName: result.fileName })}
      />
    </main>
  );
}
