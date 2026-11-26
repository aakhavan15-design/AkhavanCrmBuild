import { canEditQuoteLines } from '../lib/cpqEngine';
import { useCan, requireActiveUser } from '../hooks/useCan';
import { Select } from './ui';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPersianStatusLabel } from '../lib/labels';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isNegotiableErpOrder } from '../lib/phase2Flow';
import { formatCount } from '../lib/format';
import { AppState, Quote, QuoteLine, ID, PriceWaterfallBreakdown } from '../types';
import { generateId, nextSequenceNumber, formatCurrency, cleanNumericInput, formatInputCurrency, parsePersianNumber, formatAppDate, toLocalDateISO } from '../lib/utils';
import { calculateQuoteLineMargin, calculatePriceWaterfall } from '../lib/cpqEngine';
import { generateQuoteNegotiationScenarios, QuoteNegotiationScenario } from '../lib/negotiationEngine';
import { emitBusinessEvent } from '../lib/events';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { FileText, Send, CheckCircle2, AlertTriangle, Plus, Trash2, Sparkles, Building2, Layers, BarChart2, Search, X } from 'lucide-react';
import { CustomerInvoicePrint } from './PrintLayouts';
import { ProfitModal } from './ProfitModal';
import { QuoteWizardModal } from './QuoteWizardModal';
import { SearchableSelect, type SelectOption } from './ui/SearchableSelect';
import { enqueueOptimisticMutation } from '../lib/optimisticMutation';
import { getMetricThresholds } from '../lib/metricConfig';
import { isAuthoritativeActionAllowed } from './shared/DemoTrustBanner';
import { IntentSurface } from './shared/IntentSurface';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { toast } from './ui/Toast';
import { TrendIndicator } from './charts/TrendIndicator';
import { PrintQuoteButton } from './PrintLayouts';
import { OrderDetailsDrawer } from './shared/OrderDetailsDrawer';
import { InputControl } from './ui/Input';
import { getActiveDataProvider } from '../services/dataProvider';
import { quoteDecisionBasis } from '../lib/quoteDecisionBasis.mjs';
import { dataSyncController } from '../services/dataSyncController';

/** Recompute persisted Quote totals from line-level source values in one place. */
function recalculateQuoteFinancials(quote: Quote): void {
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const totalAmount = lines.reduce((sum, line) => {
    const lineTotal = Number.isFinite(line.lineTotal) ? line.lineTotal : line.unitPrice * line.quantity;
    return sum + (Number.isFinite(lineTotal) && lineTotal >= 0 ? lineTotal : 0);
  }, 0);
  const knownCostLines = lines.filter(line => Number.isFinite(line.costPrice) && line.costPrice > 0);
  const costsComplete = lines.length > 0 && knownCostLines.length === lines.length;
  const totalCost = knownCostLines.reduce((sum, line) => sum + line.costPrice * line.quantity, 0);
  quote.totalAmount = totalAmount;
  quote.marginPercent = costsComplete && totalAmount > 0
    ? Math.round(((totalAmount - totalCost) / totalAmount) * 1000) / 10
    : 0;
  quote.marginCompleteness = costsComplete ? 'KNOWN' : knownCostLines.length > 0 ? 'PARTIAL' : 'UNKNOWN';
  quote.updatedAt = new Date().toISOString();
}

function quoteScope(quote: Quote) {
  return { ownerId: quote.ownerId, branchId: quote.branchId, territoryId: quote.territoryId, teamId: quote.teamId, tenantId: quote.tenantId };
}

interface QuotesWorkspaceProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  setActiveTab?: (tab: string) => void;
}

export function QuotesWorkspace({ state, updateState }: QuotesWorkspaceProps) {
  const [decisionBusy,setDecisionBusy]=useState(false);
  const submittingDecision=useRef(false);
  const decisionAttempt=useRef<{key:string;id:string}|null>(null);
  const { can, canOn, denied } = useCan(state, updateState);
  const navigate = useNavigate();
  const [activeQuoteId, setActiveQuoteId] = useState<ID | null>(() => {
    return state.quotes[0]?.id || null;
  });
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [sourceOrderId, setSourceOrderId] = useState<string | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);
  const [isProfitModalOpen, setIsProfitModalOpen] = useState(false);
  const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false);
  const [waterfallBreakdown, setWaterfallBreakdown] = useState<{ title: string; breakdown: PriceWaterfallBreakdown } | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<ID>(state.externalProducts[0]?.id || '');
  const [lineQuantity, setLineQuantity] = useState<string>('1');
  const [linePrice, setLinePrice] = useState<string>(() => String(state.externalProducts[0]?.basePrice || ''));
  const [quoteSearch, setQuoteSearch] = useState('');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState('ALL');
  const [quoteFromDate, setQuoteFromDate] = useState('');
  const [quoteToDate, setQuoteToDate] = useState('');
  const [quoteDatePreset, setQuoteDatePreset] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [quoteSellerId, setQuoteSellerId] = useState('');
  const [quoteCustomerId, setQuoteCustomerId] = useState('');
  const [quoteMinAmount, setQuoteMinAmount] = useState('');
  const [quoteMaxAmount, setQuoteMaxAmount] = useState('');

  useDeepLinkCreate(() => setIsWizardOpen(true), can('quotes', 'CREATE'));

  const visibleQuotes = (state.quotes || []).filter(quote => canOn('quotes', 'VIEW', {
    ownerId: quote.ownerId, branchId: quote.branchId, territoryId: quote.territoryId, teamId: quote.teamId, tenantId: quote.tenantId
  }));
  const salesOrders = (state.salesOrders || []) as Array<Record<string, any>>;
  const eligibleErpOrders = salesOrders.filter((order: Record<string, any>) => isNegotiableErpOrder(order) && canOn('quotes', 'VIEW', {
    ownerId: order.ownerId, branchId: order.branchId, territoryId: order.territoryId, teamId: order.teamId, tenantId: order.tenantId
  }));
  useEffect(() => {
    const requestedOrder = searchParams.get('sourceOrderId');
    if (!requestedOrder) return;
    const match = eligibleErpOrders.find(order => [order.id, order.externalOrderId, order.externalId].some(value => String(value ?? '') === requestedOrder));
    if (match) { setSourceOrderId(requestedOrder); setIsWizardOpen(true); }
    const next = new URLSearchParams(searchParams); next.delete('sourceOrderId'); setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, eligibleErpOrders]);
  const visibleSellerIds = new Set(visibleQuotes.map(quote => quote.ownerId).filter(Boolean));
  const quoteSellerOptions: SelectOption[] = (state.users || []).filter(user => visibleSellerIds.has(user.id)).map(user => ({ value: user.id, label: user.name, subLabel: user.employeeCode || user.username || user.roleId || '' }));
  const quoteCustomerOptions: SelectOption[] = (state.accounts || []).filter(account => canOn('accounts', 'VIEW', { ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId, teamId: account.teamId, tenantId: account.tenantId })).map(account => ({ value: account.id, label: account.name, subLabel: [account.code, account.city].filter(Boolean).join(' · ') }));
  const filteredQuotes = visibleQuotes.filter(quote => {
    const account = state.accounts.find(item => item.id === quote.accountId);
    const seller = state.users.find(item => item.id === quote.ownerId);
    const haystack = `${quote.quoteNumber} ${account?.name || ''} ${seller?.name || ''} ${quote.status}`.toLocaleLowerCase('fa-IR').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
    if (quoteSearch.trim() && !haystack.includes(quoteSearch.trim().toLocaleLowerCase('fa-IR').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک'))) return false;
    if (quoteStatusFilter !== 'ALL' && quote.status !== quoteStatusFilter) return false;
    if (quoteSellerId && quote.ownerId !== quoteSellerId) return false;
    if (quoteCustomerId && quote.accountId !== quoteCustomerId) return false;
    const created = quote.createdAt ? new Date(quote.createdAt) : null;
    const day = created && Number.isFinite(created.getTime()) ? toLocalDateISO(created) : '';
    const today = toLocalDateISO();
    const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = toLocalDateISO(yesterdayDate);
    const weekStartDate = new Date(); weekStartDate.setDate(weekStartDate.getDate() - ((weekStartDate.getDay() + 6) % 7));
    const monthStart = `${today.slice(0, 7)}-01`;
    const effectiveFrom = quoteDatePreset === 'TODAY' ? today : quoteDatePreset === 'YESTERDAY' ? yesterday : quoteDatePreset === 'THIS_WEEK' ? toLocalDateISO(weekStartDate) : quoteDatePreset === 'THIS_MONTH' ? monthStart : quoteDatePreset === 'CUSTOM' ? quoteFromDate : '';
    const effectiveTo = quoteDatePreset === 'TODAY' ? today : quoteDatePreset === 'YESTERDAY' ? yesterday : (quoteDatePreset === 'THIS_WEEK' || quoteDatePreset === 'THIS_MONTH') ? today : quoteDatePreset === 'CUSTOM' ? quoteToDate : '';
    if (effectiveFrom && (!day || day < effectiveFrom)) return false;
    if (effectiveTo && (!day || day > effectiveTo)) return false;
    const amount = Number(quote.totalAmount || 0);
    const min = quoteMinAmount.trim() ? parsePersianNumber(quoteMinAmount) : null;
    const max = quoteMaxAmount.trim() ? parsePersianNumber(quoteMaxAmount) : null;
    if (min !== null && (!Number.isFinite(min) || amount < min)) return false;
    if (max !== null && (!Number.isFinite(max) || amount > max)) return false;
    return true;
  });
  const clearQuoteFilters = () => { setQuoteSearch(''); setQuoteStatusFilter('ALL'); setQuoteFromDate(''); setQuoteToDate(''); setQuoteDatePreset('ALL'); setQuoteSellerId(''); setQuoteCustomerId(''); setQuoteMinAmount(''); setQuoteMaxAmount(''); };
  const pendingQuotes = visibleQuotes.filter(quote => quote.status === 'PENDING_APPROVAL').length;
  const approvedQuotes = visibleQuotes.filter(quote => ['APPROVED', 'ACCEPTED'].includes(String(quote.status))).length;
  const rejectedQuotes = visibleQuotes.filter(quote => quote.status === 'REJECTED').length;
  const visibleQuoteValue = visibleQuotes.reduce((sum, quote) => sum + (Number.isFinite(Number(quote.totalAmount)) ? Number(quote.totalAmount) : 0), 0);

  // محاسبه رشد واقعی ماه جاری نسبت به ماه قبل از داده‌های مجاز (صفر عدد ثابت)
  const { valueDeltaPct, countDeltaPct } = useMemo(() => {
    const now = new Date();
    const currKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    let currVal = 0; let prevVal = 0; let currCnt = 0; let prevCnt = 0;
    visibleQuotes.forEach(q => {
      const m = String(q.createdAt || '').slice(0, 7);
      const val = Number(q.totalAmount) || 0;
      if (m === currKey) { currVal += val; currCnt += 1; }
      else if (m === prevKey) { prevVal += val; prevCnt += 1; }
    });
    return {
      valueDeltaPct: prevVal > 0 ? Math.round(((currVal - prevVal) / prevVal) * 1000) / 10 : null,
      countDeltaPct: prevCnt > 0 ? Math.round(((currCnt - prevCnt) / prevCnt) * 1000) / 10 : null,
    };
  }, [visibleQuotes]);

  const activeQuote = visibleQuotes.find(q => q.id === activeQuoteId) || visibleQuotes[0];
  const activeQuoteAccount = activeQuote ? state.accounts.find(account => account.id === activeQuote.accountId && canOn('accounts', 'VIEW', {
    ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId, teamId: account.teamId, tenantId: account.tenantId
  })) : undefined;
  const threshold = getMetricThresholds(state.settings).quoteMarginFloorPercent;
  const activeQuoteKnownCostCount = activeQuote?.lines.filter(line => Number.isFinite(line.costPrice) && line.costPrice > 0).length || 0;
  const activeQuoteMarginCompleteness = activeQuote
    ? (activeQuote.lines.length > 0 && activeQuoteKnownCostCount === activeQuote.lines.length ? 'KNOWN' : activeQuoteKnownCostCount > 0 ? 'PARTIAL' : 'UNKNOWN')
    : 'UNKNOWN';
  const negotiationScenarios = useMemo(
    () => activeQuote ? generateQuoteNegotiationScenarios(activeQuote, state) : [],
    [activeQuote, state]
  );

  const handleApplyNegotiationScenario = (scenario: QuoteNegotiationScenario) => {
    if (!activeQuote || activeQuote.status !== 'DRAFT') return;
    if (!canOn('quotes', 'EDIT', { ownerId: activeQuote.ownerId, branchId: activeQuote.branchId, territoryId: activeQuote.territoryId, teamId: activeQuote.teamId, tenantId: activeQuote.tenantId })) return denied('اعمال پیشنهاد مذاکره');
    if (scenario.creditRisk === 'CRITICAL') {
      updateState(draft => {
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({
          id: generateId(), title: 'پیشنهاد با ریسک اعتباری بالا اعمال نشد',
          message: 'مبلغ پیشنهادی از سقف اعتبار تعریف‌شده عبور می‌کند. ابتدا باید وضعیت اعتبار توسط مسئول مجاز بررسی شود.',
          type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'quotes', entityId: activeQuote.id
        });
      });
      return;
    }
    updateState(draft => {
      const quote = draft.quotes.find(item => item.id === activeQuote.id);
      if (!quote || quote.status !== 'DRAFT') return;
      const beforeAmount = quote.totalAmount;
      quote.lines = scenario.lines.map(line => ({ ...line }));
      recalculateQuoteFinancials(quote);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(), action: 'QUOTE_NEGOTIATION_SCENARIO_APPLIED', entityType: 'QUOTE', entityId: quote.id,
        details: `سناریوی «${scenario.title}» اعمال شد؛ مبلغ قبل ${beforeAmount} و مبلغ بعد ${quote.totalAmount}.`,
        actor: draft.users?.find(user => user.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString()
      });
    });
  };

  const handleCreateDraftQuote = () => {
    if (!can('quotes', 'CREATE')) return denied('صدور سفارش');
    const accessibleAccounts = (state.accounts || []).filter(account => canOn('accounts', 'VIEW', { ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId, teamId: account.teamId, tenantId: account.tenantId }));
    const preferredAccountId = state.activeContextAccountId;
    const accId = preferredAccountId && accessibleAccounts.some(account => account.id === preferredAccountId) ? preferredAccountId : accessibleAccounts[0]?.id;
    if (!accId) {
      toast.warning('ابتدا حداقل یک حساب یا مشتری در سیستم تعریف کنید.');
      return;
    }
    if (!state.currentUserId) return;
    const newId = generateId();
    const newQuoteNumber = nextSequenceNumber('QT-', (state.quotes || []).map(x => x.quoteNumber), 1001);
    updateState(draft => {
      const creator = draft.users.find(user => user.id === state.currentUserId);
      const newQuote: Quote = {
        id: newId,
        quoteNumber: newQuoteNumber,
        accountId: accId,
        ownerId: state.currentUserId,
        branchId: creator?.branchId,
        territoryId: creator?.territoryId,
        teamId: creator?.teamId,
        tenantId: creator?.tenantId,
        status: 'DRAFT',
        lines: [],
        versions: [{
          versionNumber: 1,
          totalAmount: 0,
          marginPercent: 0,
          createdAt: new Date().toISOString(),
          createdBy: state.currentUserId
        }],
        totalAmount: 0,
        marginPercent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      draft.quotes.unshift(newQuote);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(),
        action: 'QUOTE_CREATED',
        entityType: 'QUOTE',
        entityId: newId,
        details: `سفارش جدید ${newQuoteNumber} ایجاد شد`,
        actor: state.users.find(u => u.id === state.currentUserId)?.name || 'System',
        createdAt: new Date().toISOString()
      });
    });
    void enqueueOptimisticMutation({
      action: 'CREATE',
      entityType: 'quotes',
      entityId: newId,
      payload: {
        id: newId,
        quoteNumber: newQuoteNumber,
        accountId: accId,
        ownerId: state.currentUserId,
        status: 'DRAFT',
        totalAmount: 0,
        createdAt: new Date().toISOString(),
      },
      alwaysQueue: true,
    });
    setActiveQuoteId(newId);
  };

  const handleAddLine = () => {
    if (!activeQuote) return;
    { const g = canEditQuoteLines(activeQuote); if (!g.ok) return denied(g.reason || 'ویرایش اقلام سفارش'); }
    if (!canOn('quotes', 'EDIT', quoteScope(activeQuote))) return denied('ویرایش این سفارش خارج از محدوده مجاز');
    const prod = state.externalProducts.find(p => p.id === selectedProductId);
    if (!prod) return;

    const parsedPrice = parsePersianNumber(linePrice);
    const parsedQuantity = parsePersianNumber(lineQuantity);
    const unitPrice = Number.isFinite(parsedPrice) ? parsedPrice : NaN;
    const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : NaN;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
      updateState(draft => {
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({ id: generateId(), title: 'اطلاعات قلم نامعتبر است', message: 'قیمت واحد باید بزرگ‌تر از صفر و تعداد باید عدد صحیح مثبت باشد. قیمت پایه به‌صورت خودکار جایگزین نشد.', type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'quotes', entityId: activeQuote.id });
      });
      return;
    }
    const costPrice = prod.costPrice;
    const lineTotal = unitPrice * quantity;
    if (!Number.isFinite(lineTotal)) return;

    updateState(draft => {
      const q = draft.quotes.find(item => item.id === activeQuote.id);
      if (!q) return;

      const newLine: QuoteLine = {
        id: generateId(),
        productId: prod.id,
        quantity,
        unitPrice,
        costPrice,
        lineTotal
      };
      q.lines.push(newLine);

      recalculateQuoteFinancials(q);
    });

    setIsAddModalOpen(false);
  };

  const handleAddBundle = (bundleId: ID) => {
    if (!activeQuote) return;
    { const g = canEditQuoteLines(activeQuote); if (!g.ok) return denied(g.reason || 'ویرایش اقلام سفارش'); }
    if (!canOn('quotes', 'EDIT', quoteScope(activeQuote))) return denied('ویرایش این سفارش خارج از محدوده مجاز');
    const bundle = ((state.productBundles || []) as Array<Record<string, unknown>>).find(b => b.id === bundleId);
    if (!bundle) return;
    const discountPercent = Number(bundle.discountPercent);
    const productIds = bundle.productIds as string[] | undefined;
    if (!Array.isArray(productIds) || !productIds.length || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      updateState(draft => { if (!draft.notifications) draft.notifications = []; draft.notifications.push({ id: generateId(), title: 'تعریف بسته نامعتبر است', message: 'بسته باید حداقل یک محصول و تخفیف بین صفر تا صد درصد داشته باشد.', type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'quotes', entityId: activeQuote.id }); });
      return;
    }

    updateState(draft => {
      const q = draft.quotes.find(item => item.id === activeQuote.id);
      if (!q) return;

      productIds.forEach((prodId: string) => {
        const prod = state.externalProducts.find(p => p.id === prodId);
        if (prod) {
          const discountMultiplier = (100 - discountPercent) / 100;
          const discountedPrice = Math.round(prod.basePrice * discountMultiplier);
          q.lines.push({
            id: generateId(),
            productId: prod.id,
            quantity: 1,
            unitPrice: discountedPrice,
            costPrice: prod.costPrice,
            lineTotal: discountedPrice,
            appliedTiers: [String(bundle.name || '')]
          });
        }
      });

      recalculateQuoteFinancials(q);
    });

    setIsBundleModalOpen(false);
  };

  const handleOpenLineWaterfall = (line: QuoteLine) => {
    const prod = state.externalProducts.find(p => p.id === line.productId);
    if (!prod) return;
    const hasSnapshot = !!activeQuote.pricingSnapshot;
    const contract = hasSnapshot ? undefined : ((state.contracts || []) as Array<Record<string, unknown>>).find(c => c.accountId === activeQuote.accountId);
    const rebateValue = Number(contract?.rebatePercent);
    const rebate = Number.isFinite(rebateValue) && rebateValue >= 0 && rebateValue <= 100 ? rebateValue : 0;
    const applicableTiers = hasSnapshot ? [] : ((state.volumeTiers || []) as Array<Record<string, unknown>>).filter(vt =>
      vt.productId === prod.id && Number.isFinite(Number(vt.minQuantity)) && line.quantity >= Number(vt.minQuantity) &&
      Number.isFinite(Number(vt.discountPercent)) && Number(vt.discountPercent) >= 0 && Number(vt.discountPercent) <= 100
    ).sort((a, b) => Number(b.minQuantity) - Number(a.minQuantity));
    const volumeDiscountPercent = Number(applicableTiers[0]?.discountPercent) || 0;

    const snapshot = (activeQuote as Record<string, unknown>).pricingSnapshot as { productBasePrices?: Record<string, number>; productCosts?: Record<string, number> } | undefined;
    const snapshotBasePrice = snapshot?.productBasePrices?.[prod.id];
    const snapshotCostPrice = snapshot?.productCosts?.[prod.id];
    const breakdown = calculatePriceWaterfall({
      basePrice: typeof snapshotBasePrice === 'number' && Number.isFinite(snapshotBasePrice) ? snapshotBasePrice : prod.basePrice,
      quantity: line.quantity,
      costPrice: typeof snapshotCostPrice === 'number' && Number.isFinite(snapshotCostPrice) ? snapshotCostPrice : line.costPrice,
      negotiatedUnitPrice: line.unitPrice,
      appliedVolumeDiscountPercent: volumeDiscountPercent,
      contractRebatePercent: rebate
    });

    setWaterfallBreakdown({
      title: `${hasSnapshot ? 'تحلیل قیمت ثبت‌شده' : 'تحلیل قیمت و قواعد فعلی'}: ${prod.name}`,
      breakdown
    });
  };

  const handleRemoveLine = (lineId: ID) => {
    if (!activeQuote) return;
    { const g = canEditQuoteLines(activeQuote); if (!g.ok) return denied(g.reason || 'ویرایش اقلام سفارش'); }
    if (!canOn('quotes', 'EDIT', quoteScope(activeQuote))) return denied('ویرایش این سفارش خارج از محدوده مجاز');
    updateState(draft => {
      const q = draft.quotes.find(item => item.id === activeQuote.id);
      if (!q) return;
      const removed = q.lines.find(l => l.id === lineId);
      q.lines = q.lines.filter(l => l.id !== lineId);
      if (removed) {
        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.push({
          id: generateId(), action: 'QUOTE_LINE_REMOVED', entityType: 'QUOTE', entityId: q.id,
          details: `قلم «${(removed as Record<string, unknown>).productName || (removed as Record<string, unknown>).name || removed.id}» (مبلغ ${Number(removed.lineTotal || 0).toLocaleString('fa-IR')} ریال) از سفارش ${q.quoteNumber} حذف شد`,
          actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString()
        });
      }

      recalculateQuoteFinancials(q);
    });
  };

  const handleAction = async (action: 'REQUEST_APPROVAL' | 'APPROVE' | 'ACCEPT' | 'REJECT' | 'HANDOFF') => {
    const permission=action==='APPROVE' || action==='REJECT' || action==='HANDOFF' ? 'APPROVE' : 'EDIT';
    if (submittingDecision.current || !can('quotes',permission)) return;
    if (!activeQuote) return;
    if (action !== 'HANDOFF' && !requireActiveUser(state, updateState, 'تغییر وضعیت سفارش')) return;
    if (!canOn('quotes',permission,quoteScope(activeQuote))) return denied('دسترسی به این سفارش');
    const allowedTransition: Record<typeof action, boolean> = {
      REQUEST_APPROVAL: activeQuote.status === 'DRAFT' && activeQuote.lines.length > 0,
      APPROVE: (activeQuote.status === 'DRAFT' || activeQuote.status === 'PENDING_APPROVAL') && activeQuote.lines.length>0,
      ACCEPT: activeQuote.status === 'APPROVED',
      REJECT: activeQuote.status === 'PENDING_APPROVAL',
      HANDOFF: activeQuote.status === 'ACCEPTED'
    };
    if (!allowedTransition[action]) return denied('انتقال وضعیت غیرمجاز سفارش');
    if (action === 'HANDOFF') {
      if (!isAuthoritativeActionAllowed(state)) {
        updateState(draft => {
          if (!draft.notifications) draft.notifications = [];
          draft.notifications.push({
            id: generateId(),
            title: 'ارسال در حالت آزمایشی غیرفعال است',
            message: 'داده آزمایشی است؛ ارسال به سامانه مالی به‌عنوان واقعیت قطعی انجام نمی‌شود.',
            type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'quotes', entityId: activeQuote.id
          });
        });
        return;
      }
      updateState(draft => {
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({
          id: generateId(),
          title: 'ارسال به سامانه خارجی پیکربندی نشده است',
          message: `سفارش ${activeQuote.quoteNumber} ارسال نشد. برای تحویل واقعی، درگاه ارتباطی مجاز و صف ارسال سمت سرور باید پیکربندی شود.`,
          type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'quotes', entityId: activeQuote.id
        });
        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.push({
          id: generateId(), action: 'QUOTE_HANDOFF_BLOCKED_NOT_CONFIGURED', entityType: 'QUOTE', entityId: activeQuote.id,
          details: `تلاش برای ارسال ${activeQuote.quoteNumber} انجام شد؛ ارسال به‌دلیل نبود درگاه ارتباطی واقعی متوقف شد.`,
          actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString()
        });
      });
      return;
    }
    const provider=getActiveDataProvider();
    if (provider.name==='SQLSERVER_BACKEND') {
      const engine=dataSyncController.getEngine();
      const expectedAt=activeQuote.updatedAt ?? activeQuote.createdAt;
      submittingDecision.current=true;
      setDecisionBusy(true);
      try {
        const expectedBasis=await quoteDecisionBasis(activeQuote);
        const key=JSON.stringify([activeQuote.id,action,expectedBasis]);
        const commandId=decisionAttempt.current?.key===key ? decisionAttempt.current.id : crypto.randomUUID();
        decisionAttempt.current={key,id:commandId};
        const receipt=await provider.decideQuote(activeQuote.id,{action,expectedAt,expectedBasis,commandId});
        if (receipt.quote?.id!==activeQuote.id) throw new Error('رسید ثبت تصمیم دریافت نشد.');
        if (engine!==dataSyncController.getEngine()) return;
        if (!engine?.acknowledgeRecord('quotes',receipt.quote,activeQuote)) {
          await dataSyncController.retrieveFromSqlServer();
        }
        decisionAttempt.current=null;
        toast.success('تصمیم پیش‌فاکتور در سرور ثبت شد.');
      } catch (cause) {
        toast.warning(cause instanceof Error ? cause.message : 'ثبت تصمیم ممکن نشد.');
      } finally {
        submittingDecision.current=false;
        setDecisionBusy(false);
      }
      return;
    }
    updateState(draft => {
      const quote = draft.quotes.find(q => q.id === activeQuote.id);
      if (!quote) return;

      if (action === 'REQUEST_APPROVAL') {
        quote.status = 'PENDING_APPROVAL';
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({
          id: generateId(),
          title: `درخواست تایید سفارش ${quote.quoteNumber}`,
          message: `مارجین سفارش (${quote.marginPercent}٪) کمتر از حد آستانه (${threshold}٪) است و نیازمند تایید است.`,
          type: 'WARNING',
          read: false,
          createdAt: new Date().toISOString(),
          linkTab: 'quotes'
        });
      }

      if (action === 'APPROVE') {
        quote.status = 'APPROVED';
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({
          id: generateId(),
          title: `سفارش ${quote.quoteNumber} تایید شد`,
          message: `مدیریت سفارش را با مارجین ${quote.marginPercent}٪ تایید کرد.`,
          type: 'SUCCESS',
          read: false,
          createdAt: new Date().toISOString(),
          linkTab: 'quotes'
        });
      }

      if (action === 'ACCEPT') {
        quote.status = 'ACCEPTED';
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({
          id: generateId(),
          title: `سفارش ${quote.quoteNumber} توسط مشتری پذیرفته شد`,
          message: 'پذیرش ثبت شد. صدور فاکتور قطعی باید از مسیر مجاز مالی/سامانه مالی و با نتیجه واقعی منبع انجام شود.',
          type: 'SUCCESS',
          read: false,
          createdAt: new Date().toISOString(),
          linkTab: 'quotes',
          entityId: quote.id
        });
        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.push({
          id: generateId(), action: 'QUOTE_ACCEPTED', entityType: 'QUOTE', entityId: quote.id,
          details: `پذیرش مشتری برای سفارش ${quote.quoteNumber} ثبت شد؛ فاکتور قطعی به‌صورت خودکار ایجاد نشد.`,
          actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System',
          createdAt: new Date().toISOString()
        });
      }

      if (action === 'REJECT') {
        quote.status = 'REJECTED';
      }

      quote.updatedAt = new Date().toISOString();
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(), action: `QUOTE_${action}`, entityType: 'QUOTE', entityId: quote.id,
        details: `عملیات ${action} روی سفارش ${quote.quoteNumber} انجام شد؛ وضعیت فعلی: ${getPersianStatusLabel(quote.status)}.`,
        actor: draft.users?.find(user => user.id === draft.currentUserId)?.name || 'System', createdAt: quote.updatedAt
      });
    });

    void enqueueOptimisticMutation({
      action: 'UPDATE',
      entityType: 'quotes',
      entityId: activeQuote.id,
      payload: { id: activeQuote.id, workflowAction: action },
      alwaysQueue: true,
    });
    if (action === 'APPROVE') {
      emitBusinessEvent('QUOTE_APPROVED', 'QUOTE', activeQuote.id, activeQuote, state, updateState);
    }
  };

  const handleConvertToInvoice = () => {
    if (!can('quotes', 'EDIT') || !can('finance', 'CREATE')) return denied('تبدیل سفارش به فاکتور');
    if (!activeQuote) return;
    if (activeQuote.status !== 'ACCEPTED') return denied('ثبت فاکتور فقط برای سفارش پذیرفته‌شده مجاز است');
    if (!canOn('quotes', 'EDIT', quoteScope(activeQuote))) return denied('دسترسی به این سفارش');
    if (!requireActiveUser(state, updateState, 'ثبت فاکتور دستی')) return;
    const manualFinanceEntryEnabled = (state.settings as Record<string, any>)?.orgConfig?.allowManualFinanceEntry === true;
    if (!manualFinanceEntryEnabled) {
      updateState(draft => {
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({
          id: generateId(), title: 'صدور فاکتور دستی مجاز نیست',
          message: 'سفارش به فاکتور قطعی تبدیل نشد. صدور فاکتور باید از سامانه مالی/حسابداری یا از مسیر ورود دستیِ صریحاً مجاز انجام شود.',
          type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'finance', entityId: activeQuote.id
        });
      });
      return;
    }
    const invNum = `INV-${activeQuote.quoteNumber.replace('QT-', '')}`;
    if ((state.invoices || []).some(i => i.invoiceNumber === invNum)) {
      updateState(draft => {
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({
          id: generateId(), title: 'فاکتور تکراری ایجاد نشد',
          message: `فاکتور با شماره ${invNum} از قبل وجود دارد؛ برای جلوگیری از ثبت تکراری عملیات متوقف شد.`,
          type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'finance', entityId: activeQuote.id
        });
      });
      return;
    }
    const invId = generateId();
    const invoiceItems = activeQuote.lines.map(line => {
      const prod = state.externalProducts.find(p => p.id === line.productId);
      return {
        id: generateId(),
        description: prod?.name || `کالای کد ${line.productId}`,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.lineTotal
      };
    });

    updateState(draft => {
      if (!draft.invoices) draft.invoices = [];
      const newInvoice = {
        id: invId,
        invoiceNumber: invNum,
        accountId: activeQuote.accountId || '',
        customerId: activeQuote.accountId || '',
        totalAmount: activeQuote.totalAmount,
        paidAmount: 0,
        balance: activeQuote.totalAmount,
        status: 'UNPAID' as const,
        date: new Date().toISOString(),
        items: invoiceItems
      };
      draft.invoices.unshift(newInvoice);

      const q = draft.quotes.find(item => item.id === activeQuote.id);
      if (q) {
        q.status = 'ACCEPTED';
        (q as Record<string, unknown>).invoicedId = invId;
        q.updatedAt = new Date().toISOString();
      }
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(), action: 'MANUAL_INVOICE_CREATED_FROM_QUOTE', entityType: 'INVOICE', entityId: invId,
        details: `فاکتور دستی ${invNum} از سفارش ${activeQuote.quoteNumber} ایجاد شد؛ سیاست ورود دستی مالی فعال بود.`,
        actor: draft.users?.find(user => user.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString()
      });

      if (!draft.notifications) draft.notifications = [];
      draft.notifications.push({
        id: generateId(),
        title: `فاکتور رسمی صادر شد`,
        message: `سفارش ${activeQuote.quoteNumber} با موفقیت به فاکتور رسمی مالی ${invNum} تبدیل گردید.`,
        type: 'SUCCESS',
        read: false,
        createdAt: new Date().toISOString(),
        linkTab: 'finance'
      });
    });

    navigate('/finance');
  };

  const getStatusBadge = (status: Quote['status']) => {
    switch (status) {
      case 'DRAFT': return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-canvas text-text-secondary">پیش‌نویس</span>;
      case 'PENDING_APPROVAL': return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 text-warning">در انتظار تایید مدیریت</span>;
      case 'APPROVED': return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-sky-50 text-info">تایید شده توسط مدیریت</span>;
      case 'SENT': return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-primary/10 text-primary">ارسال به مشتری</span>;
      case 'ACCEPTED': return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-success-soft text-success">تایید نهایی مشتری</span>;
      case 'REJECTED': return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-50 text-danger">رد شده</span>;
      case 'HANDOFF_EXTERNAL': return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-primary/20 text-primary-hover">ارسال به سامانه مالی</span>;
      default: return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-600">{status}</span>;
    }
  };

  return (
    <div className="crm-page crm-page-quotes flex-1 min-w-0 overflow-auto bg-transparent px-2 py-3 sm:px-4 sm:py-4 space-y-3 pb-[calc(6rem+env(safe-area-inset-bottom))]" dir="rtl">
      <IntentSurface state={state} maxItems={2} />
      <Card id="quote-actions" padding="md" className="crm-page-heading flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-surface border-border">
        <div>
          <h2 data-tour-heading className="text-lg font-bold text-text-main flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> میز سفارشات و تصمیم‌گیری تجاری (قیمت‌گذاری)
          </h2>
          <span className="text-xs text-text-secondary block mt-0.5">
            پیکربندی قیمت، درخواست تاییدیه مارجین و ثبت پیشنهاد تجاری
          </span>
        </div>
        {valueDeltaPct !== null && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <TrendIndicator value={valueDeltaPct} label="رشد ماهانه" format="percent" size="sm" />
          </div>
        )}
      </Card>

      <section className="rounded-xl border border-border bg-surface p-3 space-y-2" aria-label="سبد پیشنهاد فروش CPQ از سفارش‌های ERP">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-text-main">سبد پیشنهاد فروش CPQ</h3><span className="text-micro text-text-secondary">{formatCount(eligibleErpOrders.length)} سفارش ERP واجد شرایط</span></div>
        <p className="text-micro text-text-secondary">در این مسیر سفارش ERP فقط مبنای پیشنهاد و مذاکره است؛ Quote سفارش رسمی ERP ایجاد نمی‌کند.</p>
        <div className="divide-y divide-border max-h-[28rem] overflow-auto">
          {eligibleErpOrders.map(order => {
            const account = state.accounts.find(item => item.id === (order.accountId ?? order.customerId));
            const key = String(order.externalOrderId ?? order.externalId ?? order.id);
            return <div key={String(order.id)} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="text-caption font-bold text-text-main truncate">{String(order.orderNumber ?? order.documentNumber ?? key)}</div><div className="text-micro text-text-secondary truncate">{account?.name || 'مشتری نامشخص'} · {String(order.status ?? order.statusCode ?? 'وضعیت نامشخص')}</div></div>
              <Button size="sm" variant="outline" onClick={() => { setSourceOrderId(key); setIsWizardOpen(true); }}>پیشنهاد CPQ</Button>
            </div>;
          })}
          {eligibleErpOrders.length === 0 && <p className="py-3 text-caption text-text-secondary">سفارش ERP واجد شرایط مذاکره در داده مجاز موجود نیست.</p>}
        </div>
      </section>

      <section id="quote-summary-tiles" data-tour-primary className="rounded-lg border border-border/80 bg-surface px-3 py-3 space-y-3 shadow-xs" aria-label="فیلتر و خلاصه پیشنهادهای تجاری">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div
            className="sm:col-span-2 p-3.5 rounded-card-sm text-on-primary flex flex-col justify-between"
            style={{
              background: 'linear-gradient(145deg, var(--emerald) 0%, var(--emerald-deep) 100%)',
              boxShadow: '0 4px 14px color-mix(in srgb, var(--emerald) 25%, transparent)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium opacity-90">مجموع ارزش پیشنهادهای قابل مشاهده</span>
              <div className="flex items-center gap-2">
                <span className="text-micro font-mono opacity-80 bg-white/10 px-2 py-0.5 rounded-full">
                  {visibleQuotes.length.toLocaleString('fa-IR')} فقره ثبت‌شده
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight">
                  {formatCurrency(visibleQuoteValue)}
                </span>
                <span className="text-xs opacity-80 font-normal">ریال</span>
              </div>
              {valueDeltaPct !== null && (
                <span className="text-caption font-medium px-2 py-0.5 rounded-full bg-white/20 text-white inline-flex items-center gap-1">
                  {valueDeltaPct >= 0 ? '↑' : '↓'} {valueDeltaPct.toLocaleString('fa-IR')}٪ نسبت به ماه قبل
                </span>
              )}
            </div>
            <div className="mt-2.5">
              <div className="w-full h-1.5 rounded-full bg-black/20 overflow-hidden flex">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500"
                  style={{ width: `${visibleQuotes.length > 0 ? Math.min(100, Math.round((approvedQuotes / visibleQuotes.length) * 100)) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-mini opacity-90">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                  {approvedQuotes.toLocaleString('fa-IR')} پذیرفته / تأییدشده
                </span>
                <span className="flex items-center gap-1 opacity-80">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/60 inline-block" />
                  {pendingQuotes.toLocaleString('fa-IR')} در انتظار تأیید
                </span>
              </div>
            </div>
          </div>

          <div
            className="p-3.5 rounded-card-sm border border-border flex flex-col justify-between"
            style={{ background: 'var(--bg-sunken)' }}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-caption font-medium text-text-secondary block">تعداد کل اسناد مجاز</span>
                <div className="text-2xl font-bold text-text-main tabular-nums tracking-tight mt-1">
                  {visibleQuotes.length.toLocaleString('fa-IR')}
                </div>
              </div>
              {countDeltaPct !== null && <TrendIndicator value={countDeltaPct} label="" size="sm" />}
            </div>
            <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-caption text-text-muted">
              <span>ردشده یا اصلاحی:</span>
              <span className="font-bold tabular-nums text-danger">{rejectedQuotes.toLocaleString('fa-IR')}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 pt-1">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-canvas px-3"><Search size={15} className="text-text-secondary"/><input value={quoteSearch} onChange={event => setQuoteSearch(event.target.value)} placeholder="جست‌وجوی شماره، مشتری یا فروشنده" aria-label="جست‌وجوی پیشنهادها" className="min-w-0 flex-1 bg-transparent text-xs outline-none"/></label>
          <Select density="compact" value={quoteStatusFilter} onChange={event => setQuoteStatusFilter(event.target.value)} aria-label="فیلتر وضعیت پیشنهاد"><option value="ALL">همه وضعیت‌ها</option><option value="DRAFT">پیش‌نویس</option><option value="PENDING_APPROVAL">در انتظار تأیید</option><option value="APPROVED">تأیید مدیریت</option><option value="SENT">ارسال‌شده</option><option value="ACCEPTED">پذیرفته‌شده</option><option value="REJECTED">ردشده</option><option value="HANDOFF_EXTERNAL">تحویل به سامانه مالی</option></Select>
          <SearchableSelect options={quoteSellerOptions} value={quoteSellerId} onChange={setQuoteSellerId} placeholder="همه فروشندگان" searchPlaceholder="نام یا کد فروشنده..." ariaLabel="فیلتر فروشنده" />
          <SearchableSelect options={quoteCustomerOptions} value={quoteCustomerId} onChange={setQuoteCustomerId} placeholder="همه مشتریان" searchPlaceholder="نام یا کد مشتری..." ariaLabel="فیلتر مشتری" />
          <Select density="compact" value={quoteDatePreset} onChange={event => setQuoteDatePreset(event.target.value as typeof quoteDatePreset)} aria-label="بازه زمانی پیشنهادها"><option value="ALL">تمام بازه‌ها</option><option value="TODAY">امروز</option><option value="YESTERDAY">دیروز</option><option value="THIS_WEEK">هفته جاری</option><option value="THIS_MONTH">ماه جاری</option><option value="CUSTOM">بازه سفارشی</option></Select>
          {quoteDatePreset === 'CUSTOM' ? <><label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-canvas px-3"><span className="text-micro text-text-secondary">از</span><input type="date" value={quoteFromDate} onChange={event => setQuoteFromDate(event.target.value)} aria-label="از تاریخ" className="min-w-0 flex-1 bg-transparent text-xs"/></label><label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-canvas px-3"><span className="text-micro text-text-secondary">تا</span><input type="date" value={quoteToDate} onChange={event => setQuoteToDate(event.target.value)} aria-label="تا تاریخ" className="min-w-0 flex-1 bg-transparent text-xs"/></label></> : <div className="flex h-10 items-center rounded-lg bg-canvas px-3 text-caption text-text-secondary">{quoteDatePreset === 'ALL' ? 'تاریخ ایجاد: همه موارد' : 'بازه بر اساس تاریخ محلی ایجاد'}</div>}
          <InputControl inputMode="numeric" value={quoteMinAmount} onChange={event => setQuoteMinAmount(event.target.value)} placeholder="حداقل مبلغ (ریال)" aria-label="حداقل مبلغ" />
          <div className="flex gap-2"><InputControl inputMode="numeric" value={quoteMaxAmount} onChange={event => setQuoteMaxAmount(event.target.value)} placeholder="حداکثر مبلغ (ریال)" aria-label="حداکثر مبلغ" className="min-w-0 flex-1"/><button type="button" onClick={clearQuoteFilters} className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-caption text-text-secondary hover:text-danger"><X size={13}/>پاک‌کردن</button></div>
        </div>
        <div className="text-caption text-text-secondary">نمایش {filteredQuotes.length.toLocaleString('fa-IR')} از {visibleQuotes.length.toLocaleString('fa-IR')} رکورد مجاز · شاخص‌ها بر اساس کل رکوردهای قابل مشاهده محاسبه شده‌اند.</div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-text-secondary px-1">فهرست پیشنهادها ({filteredQuotes.length.toLocaleString('fa-IR')})</h3>
          {filteredQuotes.length === 0 ? (
            <EmptyState surface="quotes_workspace"
              icon={<FileText className="h-7 w-7" />}
              title="پیشنهادی با این فیلتر یافت نشد"
              description="وضعیت یا عبارت جستجو را تغییر دهید، یا یک پیش‌فاکتور جدید ثبت کنید."
              compact
            />
          ) : filteredQuotes.map(q => {
            const acc = state.accounts.find(a => a.id === q.accountId);
            const accountIsVisible = !!acc && canOn('accounts', 'VIEW', { ownerId: acc.ownerId, branchId: acc.branchId, territoryId: acc.territoryId, teamId: acc.teamId, tenantId: acc.tenantId });
            const isSelected = activeQuote?.id === q.id;
            return (
              <Card
                key={q.id}
                padding="md"
                onClick={() => {
                  setActiveQuoteId(q.id);
                  setIsDetailsDrawerOpen(true);
                }}
                className={`cursor-pointer transition-all border se-pressable se-hover-lift se-soft-card ${isSelected ? 'border-border-strong bg-canvas shadow-sm' : 'border-transparent hover:bg-canvas bg-white'}`}
                data-layout-id={`quote-card-${q.id}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <strong className="text-sm font-bold text-text-main font-mono">{q.quoteNumber}</strong>
                    <div className="text-xs text-text-secondary mt-1 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-text-secondary" />
                      <span>{accountIsVisible ? acc?.name : 'حساب محدود'}</span>
                    </div>
                  </div>
                  {getStatusBadge(q.status)}
                </div>
                <div className="flex justify-between items-center mt-3 pt-2 border-t border-border text-xs">
                  <div>
                    <span className="text-text-secondary">ارزش کل: </span>
                    <strong className="font-bold font-mono text-text-main">{formatCurrency(q.totalAmount)} ریال</strong>
                  </div>
                  <Button variant="link" size="inline" type="button" onClick={(e) => { e.stopPropagation(); setActiveQuoteId(q.id); setIsDetailsDrawerOpen(true); }}>
                    <span>مشاهده جزئیات</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {activeQuote ? (
            <Card padding="lg" className="space-y-4 bg-white border-border">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-border gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-text-main font-mono">{activeQuote.quoteNumber}</h3>
                    {getStatusBadge(activeQuote.status)}
                  </div>
                  <div className="text-xs text-text-secondary mt-1 flex flex-wrap gap-3">
                    <span>حساب: {activeQuoteAccount ? <strong className="cursor-pointer hover:text-primary" onClick={() => navigate(`/accounts/${activeQuote.accountId}`)}>{activeQuoteAccount.name}</strong> : <strong>حساب محدود</strong>}</span>
                    <span>•</span>
                    <span>تاریخ: <strong className="font-mono">{formatAppDate(activeQuote.createdAt, state.settings?.locale)}</strong></span>
                    {activeQuote.validUntil && <span>اعتبار تا: <strong className="font-mono">{formatAppDate(activeQuote.validUntil, state.settings?.locale)}</strong></span>}
                    {activeQuote.externalOrderId && (
                      <span className="text-primary font-bold font-mono">شناسه سفارش خارجی: {activeQuote.externalOrderId}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeQuote.status === 'DRAFT' && (
                    <>
                      {can('quotes', 'EDIT') && <Button disabled={decisionBusy} size="sm" variant="outline" onClick={() => handleAction('REQUEST_APPROVAL')}>
                        درخواست تایید مدیریت
                      </Button>}
                      {can('quotes', 'APPROVE') && <Button disabled={decisionBusy} size="sm" variant="primary" onClick={() => handleAction('APPROVE')}>
                        تایید قیمت
                      </Button>}
                    </>
                  )}

                  {activeQuote.status === 'PENDING_APPROVAL' && (
                    can('quotes', 'APPROVE') ? <>
                      <Button disabled={decisionBusy} size="sm" variant="success" onClick={() => handleAction('APPROVE')} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                        تایید نهایی مدیریت
                      </Button>
                      <Button disabled={decisionBusy} size="sm" variant="danger" onClick={() => handleAction('REJECT')}>
                        رد سفارش
                      </Button>
                    </> : <span className="text-xs text-warning font-bold rounded-xl bg-warning-soft px-3 py-2">در انتظار تصمیم مدیر مجاز</span>
                  )}

                  {activeQuote.status === 'APPROVED' && (
                    <Button disabled={decisionBusy || !can('quotes','EDIT')} size="sm" variant="primary" onClick={() => handleAction('ACCEPT')} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                      ثبت تاییدیه مشتری
                    </Button>
                  )}

                  {(activeQuote.status === 'ACCEPTED' || activeQuote.status === 'HANDOFF_EXTERNAL') && (
                    <>
                      {can('finance', 'CREATE') && (state.settings as Record<string, any>)?.orgConfig?.allowManualFinanceEntry === true && <Button size="sm" variant="success" onClick={handleConvertToInvoice} icon={<FileText className="w-3.5 h-3.5" />}>
                        ثبت فاکتور دستی مجاز
                      </Button>}
                      {can('finance', 'CREATE') && (state.settings as Record<string, any>)?.orgConfig?.allowManualFinanceEntry !== true && <span className="text-caption text-text-secondary rounded-xl bg-canvas px-3 py-2">صدور فاکتور باید از سامانه مالی/حسابداری انجام شود.</span>}
                      {activeQuote.status === 'ACCEPTED' && can('quotes', 'APPROVE') && (
                        <Button size="sm" variant="outline" onClick={() => handleAction('HANDOFF')} icon={<Send className="w-3.5 h-3.5" />}>
                          ارسال به سامانه مالی (نیازمند پیکربندی)
                        </Button>
                      )}
                    </>
                  )}

                  <Button variant="soft" onClick={() => setIsProfitModalOpen(true)} title="تحلیل اقتصادی و حاشیه سود">
                    <BarChart2 className="w-4 h-4" />
                    <span className="hidden sm:inline">تحلیل سود</span>
                  </Button>

                  <PrintQuoteButton quote={activeQuote} state={state} />
                </div>
              </div>

              {(activeQuoteMarginCompleteness !== 'KNOWN' || activeQuote.marginPercent < threshold) && activeQuote.lines.length > 0 && activeQuote.status === 'DRAFT' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-warning flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                  <span>
                    {activeQuoteMarginCompleteness !== 'KNOWN' ? 'بهای تمام‌شدهٔ معتبر برای همه اقلام موجود نیست؛ سود قابل اتکا نیست.' : `مارجین ناخالص این سفارش (${activeQuote.marginPercent}٪) کمتر از کف مجاز سازمانی (${threshold}٪) است.`} پیش از نهایی‌سازی نیازمند درخواست مجوز و تایید مدیر بازرگانی است.
                  </span>
                </div>
              )}

              {activeQuote.lines.length > 0 && (
                <section className="rounded-2xl border border-border bg-canvas/70 p-4 space-y-3" aria-labelledby="quote-negotiation-heading">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 id="quote-negotiation-heading" className="text-sm font-bold text-text-main flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> میز مذاکره مبتنی بر داده</h4>
                      <p className="text-caption text-text-secondary mt-1">پیشنهاد افزایش فقط وقتی نمایش داده می‌شود که پلهٔ حجمی واقعی در تنظیمات محصول وجود داشته باشد؛ درصد فرضی ساخته نمی‌شود.</p>
                    </div>
                    <span className="text-micro text-text-secondary whitespace-nowrap">{negotiationScenarios.length} سناریو</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {negotiationScenarios.map(scenario => (
                      <div key={scenario.key} className="rounded-xl border border-border bg-white p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <strong className="text-xs text-text-main">{scenario.title}</strong>
                          <span className={`text-micro rounded-full px-2 py-1 font-bold ${scenario.creditRisk === 'CRITICAL' ? 'bg-danger-soft text-danger' : scenario.creditRisk === 'HIGH' ? 'bg-warning-soft text-warning' : scenario.creditRisk === 'LOW' ? 'bg-success-soft text-success' : 'bg-canvas text-text-secondary'}`}>
                            {scenario.creditRisk === 'CRITICAL' ? 'عبور از سقف اعتبار' : scenario.creditRisk === 'HIGH' ? 'نزدیک سقف اعتبار' : scenario.creditRisk === 'LOW' ? 'در محدوده اعتبار' : 'اعتبار نامشخص'}
                          </span>
                        </div>
                        <div className="text-base font-bold font-mono text-text-main">{formatCurrency(scenario.proposedAmount)} ریال</div>
                        <div className="text-caption text-text-secondary">{scenario.proposedProfit === null ? 'سود قابل محاسبه نیست؛ بهای معتبر کافی نیست.' : `${scenario.profitCompleteness === 'PARTIAL' ? 'سود ناقص' : 'سود برآوردی'}: ${formatCurrency(scenario.proposedProfit)} ریال`}</div>
                        <p className="text-caption leading-relaxed text-text-secondary">{scenario.reason}</p>
                        {activeQuote.status === 'DRAFT' && (
                          <Button size="sm" variant="outline" className="w-full" disabled={scenario.creditRisk === 'CRITICAL'} onClick={() => handleApplyNegotiationScenario(scenario)}>
                            اعمال سناریو در پیش‌نویس
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeQuote.pricingSnapshot && (
                <div className="p-3 bg-primary/10 text-primary text-xs rounded-xl border border-primary/20 flex items-center gap-2 font-medium">
                  <span className="font-mono font-bold">این سند با تصویر لحظه‌ای قیمت ثبت و قفل گردیده است.</span>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-text-main">اقلام سفارش ({activeQuote.lines.length})</h4>
                  {activeQuote.status === 'DRAFT' && (
                    <div className="flex items-center gap-2">
                      {(state.productBundles || []).length > 0 && (
                        <Button variant="soft" size="xs" onClick={() => setIsBundleModalOpen(true)}>
                          <Layers className="w-3.5 h-3.5" /> افزودن بسته ترکیبی
                        </Button>
                      )}
                      <Button variant="soft-success" size="xs" onClick={() => { const prod = state.externalProducts[0]; if (prod) { setSelectedProductId(prod.id); setLinePrice(String(prod.basePrice)); setLineQuantity('1'); } setIsAddModalOpen(true); }}>
                        <Plus className="w-3.5 h-3.5" /> افزودن کالا از کاتالوگ
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-canvas border-b border-border text-text-secondary font-semibold">
                      <tr>
                        <th className="p-3">شرح کالا (از سیستم خارجی)</th>
                        <th className="p-3">تعداد</th>
                        <th className="p-3">قیمت واحد (ریال)</th>
                        <th className="p-3">قیمت تمام‌شده</th>
                        <th className="p-3">مبلغ کل</th>
                        <th className="p-3 text-center">آبشار قیمت</th>
                        {activeQuote.status === 'DRAFT' && <th className="p-3 text-center">حذف</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activeQuote.lines.length > 0 ? (
                        activeQuote.lines.map(line => {
                          const prod = state.externalProducts.find(p => p.id === line.productId);
                          const marginInfo = calculateQuoteLineMargin(line, prod, threshold);
                          return (
                            <tr key={line.id} className="hover:bg-canvas/50">
                              <td className="p-3 font-semibold text-text-main">
                                <div className="flex items-center gap-1.5">
                                  <span>{prod?.name || 'کالای نامشخص'}</span>
                                  {line.appliedTiers && line.appliedTiers.length > 0 && (
                                    <span className="text-micro bg-primary/10 text-primary font-bold px-1.5 py-0.2 rounded">
                                      {line.appliedTiers.join(', ')}
                                    </span>
                                  )}
                                </div>
                                <span className="block text-micro text-text-secondary font-mono">{prod?.sku}</span>
                              </td>
                              <td className="p-3 font-mono font-bold">{line.quantity}</td>
                              <td className="p-3 font-mono">{formatCurrency(line.unitPrice)}</td>
                              <td className="p-3 font-mono text-text-secondary">{formatCurrency(line.costPrice)}</td>
                              <td className="p-3 font-mono font-bold text-primary">{formatCurrency(line.lineTotal)}</td>
                              <td className="p-3 text-center">
                                <Button variant="outline" size="xs" onClick={() => handleOpenLineWaterfall(line)} title="نمایش ریز محاسبات آبشاری قیمت">
                                  <BarChart2 size={12} className="text-primary" /> {marginInfo.isCostKnown ? `${marginInfo.marginPercent}٪` : 'سود نامشخص'}
                                </Button>
                              </td>
                              {activeQuote.status === 'DRAFT' && (
                                <td className="p-3 text-center">
                                  <button aria-label="حذف قلم" onClick={() => handleRemoveLine(line.id)} className="p-1 text-text-secondary hover:text-danger rounded transition-colors cursor-pointer">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-text-secondary">
                            هنوز کالایی به این سفارش افزوده نشده است.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-canvas p-4 rounded-xl border border-border grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-caption text-text-secondary block">مبلغ کل سفارش:</span>
                  <strong className="text-base font-bold font-mono text-text-main">
                    {formatCurrency(activeQuote.totalAmount)} ریال
                  </strong>
                </div>
                <div>
                  <span className="text-caption text-text-secondary block">حاشیه سود ناخالص (مارجین):</span>
                  <strong className={`text-base font-bold font-mono ${activeQuote.marginPercent < threshold ? 'text-warning' : 'text-success'}`}>
                    {activeQuoteMarginCompleteness !== 'KNOWN' ? 'نامشخص' : `${activeQuote.marginPercent}٪`}
                  </strong>
                </div>
                <div>
                  <span className="text-caption text-text-secondary block">وضعیت مجوز مارجین:</span>
                  <span className="text-xs font-bold text-text-main">
                    {activeQuoteMarginCompleteness !== 'KNOWN' ? 'بهای معتبر کامل نیست؛ نیازمند بررسی مدیر' : activeQuote.marginPercent >= threshold ? 'مجاز و بدون نیاز به تایید' : 'نیازمند تایید سرپرست فروش'}
                  </span>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="lg" className="text-center text-text-secondary py-12 bg-white border-border space-y-3">
              <p className="text-xs">یک سفارش از فهرست انتخاب کنید یا سفارش جدید صادر نمایید.</p>
              <div className="flex justify-center gap-2">
                <Button variant="primary" size="sm" onClick={() => setIsWizardOpen(true)} icon={<Sparkles className="w-3.5 h-3.5" />}>
                  صدور با ویزارد
                </Button>
                <Button variant="outline" size="sm" onClick={handleCreateDraftQuote} icon={<Plus className="w-3.5 h-3.5" />}>
                  ایجاد پیش‌نویس پیشنهاد
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {isAddModalOpen && (
        <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="افزودن قلم کالا به سفارش" footer={<><Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>انصراف</Button><Button variant="primary" size="sm" onClick={handleAddLine}>ثبت در سفارش</Button></>}>
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-text-main mb-1">انتخاب کالا از کاتالوگ سامانه مالی</label>
              <Select aria-label="انتخاب کالا از کاتالوگ سامانه مالی" value={selectedProductId} onChange={e => { setSelectedProductId(e.target.value); const prod = state.externalProducts.find(p => p.id === e.target.value); if (prod) setLinePrice(String(prod.basePrice)); }}>
                {state.externalProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} - قیمت پایه: {formatCurrency(p.basePrice)} ریال</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-text-main mb-1">تعداد</label>
                <InputControl aria-label="تعداد" type="text" value={lineQuantity} onChange={e => setLineQuantity(cleanNumericInput(e.target.value))} placeholder="مثال: 10" className="font-mono" dir="ltr" />
              </div>
              <div>
                <label className="block font-bold text-text-main mb-1">قیمت توافقی واحد (ریال)</label>
                <InputControl aria-label="قیمت توافقی واحد (ریال)" type="text" value={formatInputCurrency(linePrice)} onChange={e => setLinePrice(cleanNumericInput(e.target.value))} placeholder="قیمت به ریال" className="font-mono" dir="ltr" />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {isBundleModalOpen && (
        <Modal isOpen={isBundleModalOpen} onClose={() => setIsBundleModalOpen(false)} title="انتخاب و درج بسته ترکیبی محصولات" footer={<Button variant="ghost" size="sm" onClick={() => setIsBundleModalOpen(false)}>بستن</Button>}>
          <div className="space-y-3 text-xs">
            <p className="text-text-secondary">با انتخاب بسته، تمام اقلام زیرمجموعه آن همراه با درصد تخفیف ویژه پکیج به سفارش اضافه می‌شوند.</p>
            <div className="space-y-2">
              {((state.productBundles || []) as Array<Record<string, unknown>>).map(b => (
                <div key={String(b.id)} className="p-3 bg-canvas border border-border rounded-xl flex justify-between items-center">
                  <div>
                    <strong className="text-sm font-bold text-text-main block">{String(b.name || '')}</strong>
                    <span className="text-caption text-primary font-bold block mt-0.5">تخفیف پکیج: {String(b.discountPercent || 0)}٪ | اقلام شامل: {Array.isArray(b.productIds) ? b.productIds.length : 0} قلم کالا</span>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => handleAddBundle(String(b.id))}>افزودن به سفارش</Button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {waterfallBreakdown && (
        <Modal isOpen={!!waterfallBreakdown} onClose={() => setWaterfallBreakdown(null)} title={waterfallBreakdown.title} footer={<Button variant="primary" size="sm" onClick={() => setWaterfallBreakdown(null)}>بستن</Button>}>
          <div id="quote-waterfall" className="space-y-3 text-xs">
            <div className="p-3 bg-canvas rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-border">
                <span className="text-text-secondary">۱. قیمت پایه کاتالوگ:</span>
                <span className="font-mono font-bold">{formatCurrency(waterfallBreakdown.breakdown.basePrice)} ریال</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border text-warning">
                <span>۲. تخفیف پلکانی تیراژ:</span>
                <span className="font-mono font-bold">- {formatCurrency(waterfallBreakdown.breakdown.volumeDiscount)} ریال</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border text-primary">
                <span>۳. تخفیف بسته ترکیبی:</span>
                <span className="font-mono font-bold">- {formatCurrency(waterfallBreakdown.breakdown.bundleDiscount)} ریال</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border text-info">
                <span>۴. ریبیت قرارداد سالانه:</span>
                <span className="font-mono font-bold">- {formatCurrency(waterfallBreakdown.breakdown.contractRebate)} ریال</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border text-danger">
                <span>۵. تخفیف توافقی مذاکره:</span>
                <span className="font-mono font-bold">- {formatCurrency(waterfallBreakdown.breakdown.negotiatedDiscount)} ریال</span>
              </div>
              <div className="flex justify-between items-center py-2 bg-success-soft px-2 rounded-lg text-success font-bold">
                <span>۶. قیمت خالص فاکتور:</span>
                <span className="font-mono text-sm">{formatCurrency(waterfallBreakdown.breakdown.netPrice)} ریال</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded-xl font-mono text-center border border-border">
              <div>
                <span className="text-caption text-text-secondary block">بهای تمام‌شده کل:</span>
                <span className="font-bold text-text-main">{formatCurrency(waterfallBreakdown.breakdown.costPrice)} ریال</span>
              </div>
              <div>
                <span className="text-caption text-text-secondary block">مارجین ناخالص:</span>
                {waterfallBreakdown.breakdown.costKnown ? (
                  <span className={`font-bold ${(waterfallBreakdown.breakdown.grossMarginPercent ?? 0) < threshold ? 'text-warning' : 'text-success'}`}>
                    {waterfallBreakdown.breakdown.grossMarginPercent}٪ ({formatCurrency(waterfallBreakdown.breakdown.grossMarginAmount || 0)} ریال)
                  </span>
                ) : (
                  <span className="font-bold text-warning">سود قابل محاسبه نیست؛ بهای تمام‌شدهٔ معتبر موجود نیست.</span>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {isProfitModalOpen && activeQuote && (
        <ProfitModal state={state} quote={activeQuote} onClose={() => setIsProfitModalOpen(false)} />
      )}

      <QuoteWizardModal isOpen={isWizardOpen} sourceOrderId={sourceOrderId} onClose={() => { setIsWizardOpen(false); setSourceOrderId(undefined); }} state={state} updateState={updateState} onQuoteCreated={(newId) => { setActiveQuoteId(newId); setIsWizardOpen(false); setSourceOrderId(undefined); navigate('/quotes'); }} />

      {activeQuote && (
        <CustomerInvoicePrint state={state} quote={activeQuote} />
      )}

      <OrderDetailsDrawer
        isOpen={isDetailsDrawerOpen}
        onClose={() => setIsDetailsDrawerOpen(false)}
        quoteId={activeQuoteId}
        state={state}
        updateState={updateState}
        onAction={decisionBusy ? undefined : handleAction}
        onOpenProfitModal={() => setIsProfitModalOpen(true)}
        canEdit={can('quotes', 'EDIT')}
        canApprove={can('quotes', 'APPROVE')}
      />
    </div>
  );
}
