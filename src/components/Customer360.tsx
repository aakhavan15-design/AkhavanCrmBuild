import { formatCount } from '../lib/format';
import { guard, requireActiveUser } from '../hooks/useCan';
import React, { useState, useMemo } from 'react';
import { FinancialContextPanel, ContextToggle } from './shared/FinancialContextPanel';
import { SubsidiaryBalancesPanel } from './shared/SubsidiaryBalancesPanel';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Account, AppState, CustomerTask, Opportunity } from '../types';
import {
  ChevronRight, Phone, Mail, Wallet, FileText, CheckSquare, Plus,
  ShieldAlert, TrendingUp, History, MessageSquare, ArrowUpRight, UserCheck,
  Activity as ActivityIcon, Sparkles
} from 'lucide-react';
import {
  formatCurrency, generateId, formatAppDate, nextSequenceNumber, cn
} from '../lib/utils';
import { Card } from './ui/Card';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { SecureField } from './ui/SecureField';
import { RBACService } from '../lib/rbac';
import { getDefaultCreditLimit } from '../lib/orgPolicy';
import { calculateCustomerRiskScore, calculateDaysOverdue } from '../services/collectionEngine';
import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { RecordTaskAction } from './shared/RecordTaskAction';
import { getPersianStatusLabel } from '../lib/labels';
import { CUSTOMER_PROPOSAL_STATUS_LABEL, proposalStatusOf } from '../lib/customerProposal';
import { getActiveDataProvider } from '../services/dataProvider';
import { isDemoContext } from '../lib/dataTrust';
import {
  ACTIVITY_FORM_SCHEMA,
  NOTE_FORM_SCHEMA,
  CONTACT_FORM_SCHEMA
} from '../services/dynamicFormEngine';

interface Customer360Props {
  customer: Account;
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  onBack: () => void;
  setActiveTab?: (tab: string) => void;
}

const fa = formatCount;

const receiptStatusLabel = (status: unknown) => {
  const labels: Record<string, string> = {
    RECEIVED: 'رسید دریافت شد', PENDING_REVIEW: 'در انتظار بررسی حسابداری',
    NEEDS_FIX: 'نیازمند اصلاح', PENDING_ERP: 'در انتظار ثبت در سامانه مالی',
    ERP_CONFIRMED: 'در سامانه مالی تأیید شد', MISMATCH: 'مغایرت؛ نیازمند بررسی'
  };
  const key = String(status || '').toUpperCase();
  return labels[key] || getPersianStatusLabel(status);
};

const isErpSourcedRecord = (record: Record<string, unknown>) =>
  record?.isErpMirror === true ||
  record?.readOnlySource === 'ERP' ||
  (Boolean(record?.sourceSystemCode) && Boolean(record?.externalId || record?.externalInvoiceId || record?.erpId));

type UltraHubKey = 'OVERVIEW' | 'TIMELINE' | 'DEALS' | 'FINANCE_SUPPORT';

export function Customer360({ customer, state, onBack, updateState, setActiveTab }: Customer360Props) {
  const navigate = useNavigate();
  const [activeHub, setActiveHub] = useState<UltraHubKey>('OVERVIEW');
  const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'ACTIVITY' | 'NOTE' | 'TASK' | 'DEAL' | 'AUDIT'>('ALL');

  const [contactModal, setContactModal] = useState<null | { initial?: Record<string, unknown> }>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  const rbac = useMemo(() => new RBACService(state), [state]);
  const customerScope = {
    ownerId: customer.ownerId, branchId: customer.branchId, territoryId: customer.territoryId,
    teamId: customer.teamId, tenantId: customer.tenantId,
    deletedAt: customer.deletedAt as string | undefined, isDeleted: customer.isDeleted as boolean | undefined
  };

  const recordScope = (record: Record<string, any>) => ({
    ownerId: record?.ownerId,
    branchId: record?.branchId ?? customer.branchId,
    territoryId: record?.territoryId ?? customer.territoryId,
    teamId: record?.teamId ?? customer.teamId,
    tenantId: record?.tenantId ?? customer.tenantId,
    deletedAt: record?.deletedAt,
    isDeleted: record?.isDeleted
  });

  const canEditAccount = rbac.canActOnRecord('accounts', 'EDIT', customerScope);
  const canViewFinance = rbac.canActOnRecord('finance', 'VIEW', customerScope);
  const proposalStatus = proposalStatusOf(customer);
  const canSubmitProposal = proposalStatus === 'LOCAL_DRAFT' && customer.ownerId === state.currentUserId
    && !isDemoContext(state) && rbac.canActOnRecord('accounts', 'CREATE', customerScope);

  const submitProposal = async () => {
    if (!canSubmitProposal || isSubmittingProposal) return;
    setIsSubmittingProposal(true);
    setProposalError(null);
    try {
      const receipt = await getActiveDataProvider().submitCustomerProposal(customer.id);
      updateState(draft => {
        const account = draft.accounts?.find(row => row.id === customer.id);
        if (!account || proposalStatusOf(account) !== 'LOCAL_DRAFT') return;
        account.erpProposalStatus = 'PENDING_ERP_REVIEW';
        account.erpProposalId = receipt.proposalId;
        account.erpProposalEventId = receipt.eventId;
      });
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : 'ثبت پیشنهاد امکان‌پذیر نبود.');
    } finally {
      setIsSubmittingProposal(false);
    }
  };
  const canCreateActivity = rbac.canActOnRecord('activities', 'CREATE', customerScope);
  const canCreateTask = rbac.canActOnRecord('tasks', 'CREATE', customerScope);
  const canCreateQuote = rbac.canActOnRecord('quotes', 'CREATE', customerScope);

  const accountQuotes = useMemo(() => (state.quotes || []).filter(q =>
    (q.accountId === customer.id || q.customerId === customer.id) &&
    rbac.canActOnRecord('quotes', 'VIEW', recordScope(q)) && !q.deletedAt && !q.isDeleted
  ), [state.quotes, customer.id, rbac]);

  const accountTasks = useMemo(() => (state.tasks || []).filter(t =>
    (t.accountId === customer.id || t.customerId === customer.id) && rbac.canActOnRecord('tasks', 'VIEW', recordScope(t)) && !t.deletedAt && !t.isDeleted
  ), [state.tasks, customer.id, rbac]);

  const accountActivities = useMemo(() => (state.activities || []).filter(a =>
    (a.accountId === customer.id || a.customerId === customer.id) && rbac.canActOnRecord('activities', 'VIEW', recordScope(a)) && !a.deletedAt && !a.isDeleted
  ), [state.activities, customer.id, rbac]);

  const accountNotes = useMemo(() => (((state as Record<string, any>).customerNotes || []) as Array<Record<string, any>>).filter(n =>
    (n.accountId === customer.id || n.customerId === customer.id) && rbac.canActOnRecord('accounts', 'VIEW', recordScope(n)) && !n.deletedAt && !n.isDeleted
  ), [state, customer.id, rbac]);

  const accountPayments = useMemo(() => canViewFinance ? (state.payments || []).filter(p =>
    (p.accountId === customer.id || p.customerId === customer.id) && rbac.canActOnRecord('payments', 'VIEW', recordScope(p)) && !p.deletedAt && !(p as Record<string, unknown>).isDeleted
  ) : [], [state.payments, customer.id, canViewFinance, rbac]);

  const accountOpportunities = useMemo(() => (state.opportunities || []).filter(o =>
    o.accountId === customer.id && rbac.canActOnRecord('opportunities', 'VIEW', recordScope(o)) && !o.deletedAt && !o.isDeleted
  ), [state.opportunities, customer.id, rbac]);

  const accountCases = useMemo(() => (((state as Record<string, any>).cases || []) as Array<Record<string, any>>).filter(c =>
    c.accountId === customer.id && rbac.canActOnRecord('cases', 'VIEW', recordScope(c)) && !c.deletedAt && !c.isDeleted
  ), [state, customer.id, rbac]);

  const accountAuditLogs = useMemo(() => (state.auditLogs || []).filter(l =>
    l.entityId === customer.id && rbac.canActOnRecord('accounts', 'VIEW', customerScope)
  ), [state.auditLogs, customer.id, rbac]);

  const totalQuotesValue = accountQuotes.reduce((acc, q) => acc + (Number(q.totalAmount) || 0), 0);
  const totalPaymentsValue = accountPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const inTransitChequesCount = canViewFinance ? (state.cheques || []).filter((cheque: Record<string, any>) => (cheque.accountId === customer.id || cheque.customerId === customer.id) && isErpSourcedRecord(cheque) && ['PENDING', 'IN_TRANSIT', 'RECEIVED', 'DEPOSITED'].includes(String(cheque.status || '').toUpperCase()) && !cheque.isGuarantee && String(cheque.type || '').toUpperCase() !== 'GUARANTEE' && !cheque.deletedAt && !cheque.isDeleted && rbac.canActOnRecord('finance', 'VIEW', recordScope(cheque))).length : 0;

  const customerInvoices = useMemo(() => canViewFinance ? (state.invoices || []).filter(i => {
    const status = String(i.status || '').toUpperCase();
    const isVoided = ['VOID', 'VOIDED', 'CANCELLED', 'CANCELED', 'DRAFT', 'DELETED'].includes(status);
    return (i.accountId === customer.id || i.customerId === customer.id) && !isVoided && isErpSourcedRecord(i as Record<string, unknown>) &&
      rbac.canActOnRecord('finance', 'VIEW', recordScope(i)) && !i.deletedAt && !(i as Record<string, unknown>).isDeleted;
  }) : [], [state.invoices, customer.id, canViewFinance, rbac]);

  const knownInvoiceBalances = customerInvoices.map(invoice => Number(invoice.balance)).filter(value => Number.isFinite(value) && value >= 0);
  const currentBalance = knownInvoiceBalances.length === customerInvoices.length && customerInvoices.length > 0
    ? knownInvoiceBalances.reduce((sum, balance) => sum + balance, 0)
    : null;

  let customerOverdue = 0;
  let maxOverdueDays = 0;
  customerInvoices.forEach(inv => {
    const days = calculateDaysOverdue(inv.dueDate);
    const rawBalance = Number(inv.balance);
    if (!Number.isFinite(rawBalance) || rawBalance < 0) return;
    if (days > 0 && rawBalance > 0) {
      customerOverdue += rawBalance;
      if (days > maxOverdueDays) maxOverdueDays = days;
    }
  });

  const bouncedChequesCount = canViewFinance ? (state.cheques || []).filter(c =>
    (c.accountId === customer.id || c.customerId === customer.id) && isErpSourcedRecord(c as Record<string, unknown>) && ['BOUNCED', 'RETURNED'].includes(String(c.status).toUpperCase()) &&
    !c.isGuarantee && String(c.type || '').toUpperCase() !== 'GUARANTEE' &&
    !['VOID', 'VOIDED', 'CANCELLED', 'CANCELED'].includes(String(c.lifecycleStatus || c.status).toUpperCase()) &&
    rbac.canActOnRecord('finance', 'VIEW', recordScope(c)) && !c.deletedAt && !c.isDeleted
  ).length : 0;

  const hasRiskEvidence = (customerInvoices.length > 0 && knownInvoiceBalances.length === customerInvoices.length) || bouncedChequesCount > 0;
  const customerRisk = canViewFinance && hasRiskEvidence
    ? calculateCustomerRiskScore(customer, customerOverdue, maxOverdueDays, bouncedChequesCount, customer.creditLimit || getDefaultCreditLimit(state))
    : null;

  const unifiedTimeline = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      description?: string;
      date: string;
      type: 'QUOTE' | 'TASK' | 'ACTIVITY' | 'NOTE' | 'PAYMENT' | 'OPPORTUNITY' | 'CASE' | 'AUDIT';
      category: 'ACTIVITY' | 'NOTE' | 'TASK' | 'DEAL' | 'AUDIT';
      icon: React.ElementType;
      color: string;
    }> = [];

    accountQuotes.forEach(q => {
      list.push({
        id: `q_${q.id}`,
        title: `پیش‌فاکتور ${q.quoteNumber}`,
        description: `مبلغ: ${formatCurrency(q.totalAmount)} ریال | وضعیت: ${getPersianStatusLabel(q.status)}`,
        date: q.createdAt,
        type: 'QUOTE',
        category: 'DEAL',
        icon: FileText,
        color: 'text-primary bg-primary/10'
      });
    });

    accountActivities.forEach(a => {
      list.push({
        id: `act_${a.id}`,
        title: `فعالیت: ${a.title}`,
        description: a.description,
        date: a.dateTime,
        type: 'ACTIVITY',
        category: 'ACTIVITY',
        icon: ActivityIcon,
        color: 'text-info bg-info-soft'
      });
    });

    accountNotes.forEach(n => {
      list.push({
        id: `note_${n.id}`,
        title: 'ثبت سابقه و یادداشت مشتری',
        description: String(n.content || ''),
        date: String(n.createdAt || ''),
        type: 'NOTE',
        category: 'NOTE',
        icon: MessageSquare,
        color: 'text-warning bg-warning-soft'
      });
    });

    accountTasks.forEach(t => {
      list.push({
        id: `tsk_${t.id}`,
        title: `ایجاد وظیفه: ${t.title}`,
        description: `مهلت: ${formatAppDate(t.dueDate, state.settings?.locale)} | وضعیت: ${getPersianStatusLabel(t.status)}`,
        date: String(t.createdAt || ''),
        type: 'TASK',
        category: 'TASK',
        icon: CheckSquare,
        color: 'text-primary bg-primary-soft'
      });
    });

    accountPayments.forEach(p => {
      list.push({
        id: `pay_${p.id}`,
        title: `رسید پرداخت: ${formatCurrency(p.amount)} ریال`,
        description: `شیوه پرداخت: ${p.method || 'واریز بانکی'} | وضعیت: ${receiptStatusLabel((p as Record<string, unknown>).receiptStatus || p.status)}`,
        date: p.date,
        type: 'PAYMENT',
        category: 'ACTIVITY',
        icon: Wallet,
        color: 'text-success bg-success-soft'
      });
    });

    accountOpportunities.forEach(o => {
      list.push({
        id: `opp_${o.id}`,
        title: `فرصت تجاری: ${o.title}`,
        description: `مبلغ: ${formatCurrency(o.amount)} ریال | مرحله: ${getPersianStatusLabel(o.stage)}`,
        date: o.createdAt,
        type: 'OPPORTUNITY',
        category: 'DEAL',
        icon: TrendingUp,
        color: 'text-primary bg-primary/10'
      });
    });

    accountCases.forEach(c => {
      list.push({
        id: `cs_${c.id}`,
        title: `پرونده پشتیبانی: ${String(c.subject || '')}`,
        description: `شماره: ${String(c.caseNumber || '')} | اولویت: ${getPersianStatusLabel(c.priority)}`,
        date: String(c.createdAt || ''),
        type: 'CASE',
        category: 'ACTIVITY',
        icon: ShieldAlert,
        color: 'text-danger bg-danger-soft'
      });
    });

    accountAuditLogs.forEach(log => {
      list.push({
        id: `aud_${log.id}`,
        title: `تغییر / ممیزی: ${log.action}`,
        description: `${log.details}${log.actor ? ` · توسط ${log.actor}` : ''}`,
        date: log.createdAt,
        type: 'AUDIT',
        category: 'AUDIT',
        icon: History,
        color: 'text-text-secondary bg-sunken'
      });
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [accountQuotes, accountActivities, accountNotes, accountTasks, accountPayments, accountOpportunities, accountCases, accountAuditLogs, state.settings?.locale]);

  const filteredTimeline = useMemo(() => {
    if (timelineFilter === 'ALL') return unifiedTimeline;
    return unifiedTimeline.filter(item => item.category === timelineFilter);
  }, [unifiedTimeline, timelineFilter]);

  const handleCreateNewQuote = () => {
    if (!guard(state, updateState, 'quotes', 'CREATE', 'صدور پیش‌فاکتور')) return;
    if (!requireActiveUser(state, updateState, 'صدور پیش‌فاکتور')) return;
    const newQuoteNumber = nextSequenceNumber('QT-', (state.quotes || []).map(x => x.quoteNumber), 1001);
    const newQuoteId = generateId();
    const creator = state.users.find(user => user.id === state.currentUserId);
    updateState(draft => {
      if (!draft.quotes) draft.quotes = [];
      draft.quotes.unshift({
        id: newQuoteId,
        quoteNumber: newQuoteNumber,
        accountId: customer.id,
        ownerId: state.currentUserId!,
        branchId: creator?.branchId,
        territoryId: creator?.territoryId,
        teamId: creator?.teamId,
        tenantId: creator?.tenantId,
        status: 'DRAFT',
        lines: [],
        totalAmount: 0,
        marginPercent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      draft.activeContextAccountId = customer.id;
    });
    if (setActiveTab) setActiveTab('quotes');
    else navigate('/quotes');
  };

  const openNegotiationDesk = () => {
    updateState(draft => { draft.activeContextAccountId = customer.id; draft.activeContextCustomerId = customer.id; });
    navigate('/quotes');
  };

  const smartDigest = useMemo(() => {
    let narrative = `${customer.name} در وضعیت ${customerRisk?.level === 'CRITICAL' ? 'پرریسک بحرانی' : 'عادی'} است. `;
    if (customerOverdue > 0) {
      narrative += `در حال حاضر ${formatCurrency(customerOverdue)} ریال مانده معوق دارد؛ اولویت اول پیگیری وصول است.`;
    } else if (accountQuotes.length > 0) {
      narrative += `مطالبه سررسیدگذشته‌ای ثبت نشده است؛ امکان پیگیری پیشنهادهای فروش وجود دارد.`;
    } else {
      narrative += `بدهی سررسیدگذشته یا سفارش باز ثبت نشده است.`;
    }
    return narrative;
  }, [customer.name, customerRisk, customerOverdue, accountQuotes.length]);

  return (
    <motion.div layoutId={customer?.id ? `account-card-${customer.id}` : undefined} transition={{ type: 'spring', stiffness: 380, damping: 34 }} className="flex-1 flex flex-col min-h-0 h-full bg-canvas font-sans" dir="rtl">
      <div className="shrink-0 px-3 pt-3 pb-2 bg-canvas">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="بازگشت به فهرست مشتریان"
              className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-text-main hover:bg-canvas transition-colors shadow-xs cursor-pointer active:scale-95"
            >
              <ChevronRight size={18} />
            </button>
            <div>
              <h1 data-tour-heading className="text-base sm:text-lg font-bold text-text-main tracking-tight leading-none">
                پرونده ۳۶۰ درجه مشتری
              </h1>
              <span className="text-caption text-text-secondary mt-0.5 block">
                {customer.name} · کد مشتری: {customer.code || 'ثبت نشده'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canCreateQuote && <>
              <button type="button" onClick={openNegotiationDesk} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-micro font-bold text-on-primary shadow-xs hover:opacity-90"><ArrowUpRight size={14}/> میز مذاکره</button>
              <button type="button" onClick={handleCreateNewQuote} title="ایجاد پیش‌فاکتور جدید" aria-label="ایجاد پیش‌فاکتور جدید" className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text-main hover:text-primary hover:bg-canvas transition-colors shadow-xs cursor-pointer active:scale-95"><Plus size={18}/></button>
            </>}
          </div>
        </div>

        <section aria-label="هویت مشتری" className="mb-2.5 rounded-2xl border border-border/80 bg-surface p-3.5 shadow-xs sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={customer.name} size="lg" className="shrink-0 ring-2 ring-primary/10" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-extrabold tracking-tight text-text-main sm:text-base">{customer.name}</h2>
                <span className="inline-flex items-center rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-nano font-bold text-primary">
                  {customer.status ? getPersianStatusLabel(customer.status) : 'وضعیت ثبت نشده'}
                </span>
              </div>
              <p className="mt-1 truncate text-caption text-text-secondary">
                {customer.company || 'نام شرکت ثبت نشده'} · کد مشتری: {customer.code || 'ثبت نشده'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="inline-flex min-h-7 items-center gap-1.5 rounded-lg text-micro font-medium text-text-secondary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`تماس با ${customer.name}`}>
                    <Phone size={12} aria-hidden="true" /> <span dir="ltr">{customer.phone}</span>
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="inline-flex min-h-7 min-w-0 items-center gap-1.5 rounded-lg text-micro font-medium text-text-secondary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <Mail size={12} aria-hidden="true" /> <span className="truncate" dir="ltr">{customer.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
          {proposalStatus && proposalStatus !== 'ERP_CONFIRMED' && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-text-secondary">
              <span role="status">{CUSTOMER_PROPOSAL_STATUS_LABEL[proposalStatus]}</span>
              {canSubmitProposal && (
                <Button type="button" size="sm" variant="outline" disabled={isSubmittingProposal} onClick={() => void submitProposal()}>
                  {isSubmittingProposal ? 'در حال ثبت پیشنهاد…' : 'ثبت پیشنهاد در صف ERP'}
                </Button>
              )}
              {proposalError && <p className="w-full text-danger" role="alert">{proposalError}</p>}
            </div>
          )}
          {customer.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
              {customer.tags.slice(0, 4).map(tag => (
                <span key={tag} className="rounded-full bg-sunken px-2 py-1 text-nano font-medium text-text-secondary">{tag}</span>
              ))}
              {customer.tags.length > 4 && <span className="px-1 py-1 text-nano text-text-muted">+{(customer.tags.length - 4).toLocaleString('fa-IR')}</span>}
            </div>
          ) : null}
        </section>

        <div className="p-2.5 mb-2.5 bg-surface border border-border/80 rounded-xl flex items-start gap-2.5 shadow-xs">
          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles size={12} />
          </div>
          <p className="text-label text-text-main leading-relaxed font-medium">
            <strong className="text-primary block text-micro">خلاصه وضعیت پرونده:</strong>
            {smartDigest}
          </p>
        </div>

        <div id="acc-metrics" data-tour-primary className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <div
            className="p-3 rounded-xl text-on-primary flex flex-col justify-between"
            style={{
              background: 'linear-gradient(145deg, var(--emerald) 0%, var(--emerald-deep) 100%)',
              boxShadow: '0 4px 14px color-mix(in srgb, var(--emerald) 25%, transparent)',
            }}
          >
            <span className="text-micro block opacity-90 font-medium">مجموع پیش‌فاکتورها</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-bold tabular-nums tracking-tight">
                {formatCurrency(totalQuotesValue)}
              </span>
              <span className="text-micro opacity-80">ریال</span>
            </div>
            <span className="text-micro opacity-80 mt-0.5 block">{formatCount(accountQuotes.length)} فقره پیش‌فاکتور</span>
          </div>

          <div className="p-3 rounded-xl border border-border bg-surface flex flex-col justify-between">
            <span className="text-micro text-text-secondary block font-medium">مانده فاکتورهای رسمی</span>
            <div className="mt-1 flex items-baseline gap-1">
              <SecureField state={state} entityType="Account" field="balance">
                {(mode) => (
                  <span className={cn('text-base sm:text-lg font-bold tabular-nums tracking-tight', currentBalance !== null && currentBalance > 0 ? 'text-danger' : 'text-text-main')}>
                    {mode === 'SEE' ? '***' : currentBalance === null ? 'نامشخص' : formatCurrency(currentBalance)}
                  </span>
                )}
              </SecureField>
              <span className="text-micro text-text-secondary">ریال</span>
            </div>
            <span className="text-micro text-text-secondary mt-0.5 block">{formatCount(customerInvoices.length)} فاکتور معتبر</span>
          </div>

          <div id="acc-churn-card" data-tour-primary className="p-3 rounded-xl border border-border bg-surface flex flex-col justify-between">
            <span className="text-micro text-text-secondary block font-medium">سقف اعتبار مصوب</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-bold text-text-main tabular-nums tracking-tight">
                {customer.creditLimit ? formatCurrency(customer.creditLimit) : 'ثبت نشده'}
              </span>
              <span className="text-micro text-text-secondary">ریال</span>
            </div>
            <span className="text-micro text-text-secondary mt-0.5 block">
              {customerRisk ? `ریسک وصول: ${customerRisk.score.toLocaleString('fa-IR')}٪` : 'داده ریسک کافی نیست'}
            </span>
          </div>
        </div>

        {canViewFinance && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
          <div className="rounded-xl border border-border bg-surface p-3"><span className="block text-micro text-text-secondary">ریسک اعتباری</span><strong className={cn('mt-1 block text-lg font-black tabular-nums', customerRisk?.level === 'CRITICAL' ? 'text-danger' : customerRisk ? 'text-success' : 'text-text-main')}>{customerRisk ? `${customerRisk.score}٪` : 'نامشخص'}</strong><span className="text-nano text-text-muted">بر اساس شواهد موجود</span></div>
          <div className="rounded-xl border border-border bg-surface p-3"><span className="block text-micro text-text-secondary">چک برگشتی</span><strong className={cn('mt-1 block text-lg font-black tabular-nums', bouncedChequesCount > 0 ? 'text-danger' : 'text-text-main')}>{fa(bouncedChequesCount)} فقره</strong><span className="text-nano text-text-muted">چک‌های معتبر مرتبط</span></div>
          <div className="rounded-xl border border-border bg-surface p-3"><span className="block text-micro text-text-secondary">چک در جریان</span><strong className="mt-1 block text-lg font-black tabular-nums">{fa(inTransitChequesCount)} فقره</strong><span className="text-nano text-text-muted">وضعیت‌های در جریان</span></div>
          <div className="rounded-xl border border-border bg-surface p-3"><span className="block text-micro text-text-secondary">پرداخت‌های ثبت‌شده</span><strong className="mt-1 block text-lg font-black tabular-nums">{fa(accountPayments.length)}</strong><span className="text-nano text-text-muted">مجموع {formatCurrency(totalPaymentsValue)} ریال</span></div>
          <div className="rounded-xl border border-border bg-surface p-3"><span className="block text-micro text-text-secondary">فاکتورهای معتبر</span><strong className="mt-1 block text-lg font-black tabular-nums">{fa(customerInvoices.length)}</strong><span className="text-nano text-text-muted">در سوابق مالی</span></div>
          <div className="rounded-xl border border-border bg-surface p-3"><span className="block text-micro text-text-secondary">مذاکرات و فرصت‌ها</span><strong className="mt-1 block text-lg font-black tabular-nums">{fa(accountQuotes.length + accountOpportunities.length)}</strong><span className="text-nano text-text-muted">سوابق تجاری</span></div>
        </div>}

        {customer.creditLimit && currentBalance !== null && (
          <div className="p-2.5 rounded-xl border border-border bg-surface space-y-1 mb-2">
            <div className="flex justify-between items-center text-mini">
              <span className="text-text-secondary">نسبت استفاده از سقف اعتبار</span>
              <span className="font-mono font-bold text-text-main">
                {Math.min(100, Math.round((currentBalance / customer.creditLimit) * 100)).toLocaleString('fa-IR')}٪
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((currentBalance / customer.creditLimit) * 100))}%` }}
              />
            </div>
          </div>
        )}

        <ContextToggle label="پرونده اعتباری و سابقه مالی مشتری" className="mb-2">
          <FinancialContextPanel subject={{ kind: 'CUSTOMER', id: customer.id }} refreshKey={(state.invoices || []).length} compact />
        </ContextToggle>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-b border-border">
          {[
            { id: 'OVERVIEW', label: 'خلاصه و هویت' },
            { id: 'TIMELINE', label: `گاه‌شمار و تاریخچه (${formatCount(unifiedTimeline.length)})` },
            { id: 'DEALS', label: `سفارش‌ها و مذاکرات (${formatCount((accountQuotes.length + accountOpportunities.length))})` },
            { id: 'FINANCE_SUPPORT', label: `مالی و خدمات (${formatCount((customerInvoices.length + accountCases.length))})` }
          ].map(hub => (
            <button
              key={hub.id}
              onClick={() => setActiveHub(hub.id as UltraHubKey)}
              className={cn(
                'h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors',
                activeHub === hub.id
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-text-secondary hover:text-text-main hover:bg-surface'
              )}
            >
              {hub.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-24 space-y-3 pt-2">
        {activeHub === 'OVERVIEW' && (
          <div className="space-y-3">
            <Card padding="md" className="space-y-2.5 rounded-xl border border-border">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-text-main flex items-center gap-1.5">
                  <UserCheck size={14} className="text-primary" />
                  مخاطبان طرف حساب ({customer.contacts?.length || 0})
                </span>
                {canEditAccount && (
                  <Button variant="link" size="inline" onClick={() => setContactModal({})}>
                    + افزودن مخاطب
                  </Button>
                )}
              </div>

              <div className="divide-y divide-border/60">
                {(customer.contacts || []).map(c => (
                  <div key={c.id} className="py-2 flex justify-between items-center text-xs">
                    <div>
                      <strong className="text-text-main">{c.name}</strong>
                      <span className="text-micro text-text-secondary block mt-0.5">{c.role || c.title || 'مسئول خرید'}</span>
                    </div>
                    <div className="text-left font-mono">
                      {c.phone && <span className="block text-text-main">{c.phone}</span>}
                      {c.email && <span className="block text-micro text-text-secondary">{c.email}</span>}
                    </div>
                  </div>
                ))}
                {(!customer.contacts || customer.contacts.length === 0) && (
                  <p className="py-3 text-center text-xs text-text-secondary">مخاطبی ثبت نشده است.</p>
                )}
              </div>
            </Card>

            <Card padding="md" className="space-y-2 rounded-xl border border-border text-xs">
              <strong className="text-text-main block font-bold">اطلاعات نشانی و اقتصادی</strong>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-text-secondary">
                <div className="p-2 bg-canvas rounded-lg">
                  <span className="text-micro block">شناسه / کد ملی:</span>
                  <span className="font-mono font-bold text-text-main mt-0.5 block">{String((customer as Record<string, unknown>).nationalId || (customer as Record<string, unknown>).nationalCode || 'ثبت نشده')}</span>
                </div>
                <div className="p-2 bg-canvas rounded-lg">
                  <span className="text-micro block">نشانی تحویل:</span>
                  <span className="font-medium text-text-main mt-0.5 block truncate">{customer.address || 'ثبت نشده'}</span>
                </div>
              </div>
            </Card>

            {canViewFinance && customerInvoices.length > 1 && <Card padding="md" className="space-y-3 rounded-xl border border-border">
              <div className="flex items-center justify-between"><div><strong className="text-xs text-text-main">روند مبلغ فاکتورها</strong><p className="mt-0.5 text-micro text-text-secondary">بر اساس اسناد معتبر موجود</p></div><span className="rounded-full bg-primary/5 px-2 py-1 text-nano font-bold text-primary">{fa(customerInvoices.length)} فاکتور</span></div>
              <div className="flex h-24 items-end gap-2 border-b border-border/70 pb-1">{[...customerInvoices].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()).slice(-8).map((invoice, _index, arr) => { const amount = Math.max(0, Number(invoice.totalAmount) || 0); const max = Math.max(1, ...arr.map(item => Number(item.totalAmount) || 0)); return <div key={invoice.id} className="group relative flex h-full flex-1 items-end"><div title={`${formatCurrency(amount)} ریال`} className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/45 transition-all" style={{ height: `${Math.max(8, amount / max * 100)}%` }} /><span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-1 text-nano text-white group-hover:block">{formatCurrency(amount)}</span></div>; })}</div>
              <div className="flex justify-between text-nano text-text-muted"><span>قدیمی‌تر</span><span>جدیدتر</span></div>
            </Card>}

            {canViewFinance && (
              <Card padding="md" className="space-y-2.5 rounded-xl border border-border">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-text-main flex items-center gap-1.5">
                    <Wallet size={14} className="text-primary" />
                    فاکتورهای رسمی اخیر
                  </span>
                  <Button variant="link" size="inline" onClick={() => setActiveHub('FINANCE_SUPPORT')}>
                    مشاهده همه
                  </Button>
                </div>

                <div className="divide-y divide-border/60">
                  {customerInvoices.slice(0, 3).map(inv => (
                    <div key={inv.id} className="py-2 flex justify-between items-center text-xs">
                      <div>
                        <strong className="font-mono text-text-main">{inv.invoiceNumber || inv.id}</strong>
                        <span className="text-micro text-text-secondary block mt-0.5">{formatAppDate(inv.date, state.settings?.locale)}</span>
                      </div>
                      <span className="font-mono font-bold text-text-main">{formatCurrency(inv.totalAmount)} ریال</span>
                    </div>
                  ))}
                  {customerInvoices.length === 0 && <p className="py-3 text-center text-xs text-text-secondary">فاکتوری ثبت نشده است.</p>}
                </div>
              </Card>
            )}
          </div>
        )}

        {activeHub === 'TIMELINE' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
              {([
                ['ALL', 'همه وقایع'],
                ['ACTIVITY', 'تماس و ویزیت'],
                ['NOTE', 'یادداشت‌ها'],
                ['TASK', 'وظایف'],
                ['DEAL', 'معاملات'],
                ['AUDIT', 'تاریخچه تغییرات'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTimelineFilter(key)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-caption font-bold transition-colors cursor-pointer shrink-0',
                    timelineFilter === key ? 'bg-primary text-on-primary' : 'bg-surface border border-border text-text-secondary'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredTimeline.map(ev => {
                const Icon = ev.icon;
                return (
                  <div key={ev.id} className="p-3 bg-surface border border-border rounded-xl flex items-start gap-3">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${ev.color}`}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <strong className="text-xs font-bold text-text-main">{ev.title}</strong>
                        <span className="text-micro font-mono text-text-secondary shrink-0">{formatAppDate(ev.date, state.settings?.locale)}</span>
                      </div>
                      {ev.description && <p className="text-caption text-text-secondary mt-1 leading-relaxed">{ev.description}</p>}
                    </div>
                  </div>
                );
              })}
              {filteredTimeline.length === 0 && (
                <div className="py-8 text-center text-xs text-text-secondary">رویدادی با این فیلتر ثبت نشده است.</div>
              )}
            </div>
          </div>
        )}

        {activeHub === 'DEALS' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs px-1">
              <span className="font-bold text-text-secondary">پیش‌فاکتورها و پیشنهادهای تجاری ({accountQuotes.length})</span>
              {canCreateQuote && (
                <Button variant="link" size="inline" onClick={handleCreateNewQuote}>
                  + پیش‌فاکتور جدید
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {accountQuotes.map(q => (
                <div key={q.id} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <strong className="font-mono text-text-main">{q.quoteNumber}</strong>
                    <span className="text-micro text-text-secondary block mt-0.5">{formatAppDate(q.createdAt, state.settings?.locale)} · مارجین: {q.marginPercent}٪</span>
                  </div>
                  <div className="text-left font-mono">
                    <strong className="font-bold text-text-main block">{formatCurrency(q.totalAmount)} ریال</strong>
                    <span className="text-micro text-primary">{getPersianStatusLabel(q.status)}</span>
                  </div>
                </div>
              ))}
              {accountQuotes.length === 0 && <p className="py-4 text-center text-xs text-text-secondary">پیش‌فاکتوری ثبت نشده است.</p>}
            </div>

            <div className="pt-2 border-t border-border">
              <span className="text-xs font-bold text-text-secondary block px-1 mb-2">فرصت‌های مذاکره پایپ‌لاین ({accountOpportunities.length})</span>
              <div className="space-y-2">
                {accountOpportunities.map(opp => (
                  <div key={opp.id} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <strong className="text-text-main">{opp.title}</strong>
                      <span className="text-micro text-text-secondary block mt-0.5">مرحله: {getPersianStatusLabel(opp.stage)}</span>
                    </div>
                    <span className="font-mono font-bold text-text-main">{formatCurrency(opp.amount)} ریال</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeHub === 'FINANCE_SUPPORT' && (
          <div className="space-y-3">
            <SubsidiaryBalancesPanel account={customer} enabled={canViewFinance} viewer={state.currentUserId} />

            <Card padding="md" className="space-y-2 rounded-xl border border-border">
              <span className="text-xs font-bold text-text-main block">رسیدهای پرداخت مشتری ({accountPayments.length})</span>
              <div className="divide-y divide-border/60">
                {accountPayments.map(p => (
                  <div key={p.id} className="py-2 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-text-main">{p.method || 'واریز بانکی'}</span>
                      <span className="text-micro text-text-secondary block mt-0.5 font-mono">{formatAppDate(p.date, state.settings?.locale)}</span>
                    </div>
                    <span className="font-mono font-bold text-success">{formatCurrency(p.amount)} ریال</span>
                  </div>
                ))}
                {accountPayments.length === 0 && <p className="py-3 text-center text-xs text-text-secondary">رسیدی ثبت نشده است.</p>}
              </div>
            </Card>

            <Card padding="md" className="space-y-2 rounded-xl border border-border">
              <span className="text-xs font-bold text-text-main block">پرونده‌های پشتیبانی و شکایات ({accountCases.length})</span>
              <div className="divide-y divide-border/60">
                {accountCases.map(c => (
                  <div key={String(c.id)} className="py-2 flex justify-between items-center text-xs">
                    <div>
                      <strong className="text-text-main">{String(c.subject || '')}</strong>
                      <span className="text-micro text-text-secondary block mt-0.5">کد: {String(c.caseNumber || '')}</span>
                    </div>
                    <span className="text-micro font-bold text-warning">{getPersianStatusLabel(c.status)}</span>
                  </div>
                ))}
                {accountCases.length === 0 && <p className="py-3 text-center text-xs text-text-secondary">پرونده شکایتی ثبت نشده است.</p>}
              </div>
            </Card>
          </div>
        )}
      </div>

      <div id="acc-dock" data-tour-actions className="sticky bottom-0 z-20 w-full p-2.5 bg-surface/95 backdrop-blur-xl border-t border-border flex items-center justify-center gap-2">
        {canCreateActivity && (
          <Button variant="outline" size="sm" className="flex-1 max-w-(--size-150)" type="button" onClick={() => setIsActivityModalOpen(true)}>
            <ActivityIcon size={13} className="text-primary" />
            <span>ثبت فعالیت</span>
          </Button>
        )}
        {canEditAccount && (
          <Button variant="outline" size="sm" className="flex-1 max-w-(--size-150)" type="button" onClick={() => setIsNoteModalOpen(true)}>
            <MessageSquare size={13} className="text-text-secondary" />
            <span>یادداشت</span>
          </Button>
        )}
        {canCreateTask && (
          <RecordTaskAction
            state={state}
            updateState={updateState}
            accounts={(state.accounts || []).filter(account => rbac.canActOnRecord('accounts', 'VIEW', { ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId, teamId: account.teamId, tenantId: account.tenantId }))}
            record={{ type: 'ACCOUNT', id: customer.id, display: customer.name, accountId: customer.id }}
            label="وظیفه جدید"
            className="flex-1 max-w-(--size-150)"
          />
        )}
      </div>

      {isActivityModalOpen && (
        <Modal isOpen onClose={() => setIsActivityModalOpen(false)} title="ثبت فعالیت و تعامل با مشتری">
          <DynamicFormRenderer
            schema={ACTIVITY_FORM_SCHEMA}
            initialValues={{ activityType: 'CALL', outcome: 'FOLLOW_UP', visitLocationType: 'STORE' }}
            onSubmit={values => {
              updateState(draft => {
                if (!draft.activities) draft.activities = [];
                draft.activities.unshift({
                  id: generateId(),
                  accountId: customer.id,
                  type: values.activityType,
                  title: values.title,
                  description: values.description,
                  dateTime: new Date().toISOString(),
                  ownerId: state.currentUserId!
                } as any);
              });
              setIsActivityModalOpen(false);
            }}
            onCancel={() => setIsActivityModalOpen(false)}
            submitLabel="ذخیره فعالیت"
          />
        </Modal>
      )}

      {isNoteModalOpen && (
        <Modal isOpen onClose={() => setIsNoteModalOpen(false)} title="ثبت یادداشت و سابقه مذاکره">
          <DynamicFormRenderer
            schema={NOTE_FORM_SCHEMA}
            initialValues={{ category: 'GENERAL' }}
            onSubmit={values => {
              updateState(draft => {
                if (!(draft as Record<string, any>).customerNotes) (draft as Record<string, any>).customerNotes = [];
                (draft as Record<string, any>).customerNotes.unshift({
                  id: generateId(),
                  accountId: customer.id,
                  content: values.content,
                  authorId: state.currentUserId!,
                  createdAt: new Date().toISOString()
                });
              });
              setIsNoteModalOpen(false);
            }}
            onCancel={() => setIsNoteModalOpen(false)}
            submitLabel="ذخیره یادداشت"
          />
        </Modal>
      )}

      {contactModal && (
        <Modal isOpen onClose={() => setContactModal(null)} title="افزودن / ویرایش مخاطب">
          <DynamicFormRenderer
            schema={CONTACT_FORM_SCHEMA}
            initialValues={contactModal.initial || {}}
            onSubmit={values => {
              updateState(draft => {
                const target = draft.accounts.find(c => c.id === customer.id);
                if (!target) return;
                if (!target.contacts) target.contacts = [];
                if (contactModal.initial?.id) {
                  const idx = target.contacts.findIndex(c => c.id === contactModal.initial?.id);
                  if (idx >= 0) target.contacts[idx] = { ...target.contacts[idx], ...values };
                } else {
                  target.contacts.push({ id: generateId(), accountId: customer.id, ...values });
                }
              });
              setContactModal(null);
            }}
            onCancel={() => setContactModal(null)}
            submitLabel="ذخیره مخاطب"
          />
        </Modal>
      )}
    </motion.div>
  );
}
