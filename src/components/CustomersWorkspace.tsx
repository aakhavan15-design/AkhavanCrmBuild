import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Phone, Plus, Search, ShieldAlert, Users, MapPin, Wallet, ArrowUpLeft } from 'lucide-react';
import { AppState, Account } from '../types';
import { Customer360 } from './Customer360';
import { Button } from './ui/Button';
import { LoadingState } from './ui/LoadingState';
import { EmptyState } from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { DataTable, DataTableColumn, DetailField, DetailGroup } from './ui/DataTable';
import { FilterGroup, FilterSelection } from '../lib/tableEngine';
import { cn, formatAppDate, generateId } from '../lib/utils';
import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { CUSTOMER_FORM_SCHEMA } from '../services/dynamicFormEngine';
import { activeRecords } from '../lib/recordLifecycle';
import { resolveCustomerBalanceView } from '../lib/receivableReconciliation';
import { useDataQuery } from '../hooks/useDataProvider';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { requireActiveUser, useCan } from '../hooks/useCan';
import { getPersianStatusLabel } from '../lib/labels';
import { smartSearch, SMART_SEARCH_DEBOUNCE_MS } from '../lib/smartSearch';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ProgressiveDisclosure } from './shared/ProgressiveDisclosure';
import { IntentSurface } from './shared/IntentSurface';
import { enqueueOptimisticMutation } from '../lib/optimisticMutation';
import { InputControl } from './ui/Input';
import { FilterChip } from './ui/Tabs';
import { RecordTaskAction } from './shared/RecordTaskAction';
import { matchExistingCustomers } from '../lib/enterprise';
import { proposalStatusOf, CUSTOMER_PROPOSAL_STATUS_LABEL } from '../lib/customerProposal';
import { useLedgerBookScope } from '../hooks/useLedgerBookScope';
import { LedgerBookSourceSelect } from './finance/LedgerBookSourceSelect';
import { useDataSyncStatus } from '../services/dataSyncController';

interface CustomersWorkspaceProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
}

interface CustomerExtras {
  origin?: string; erpLinkStatus?: string; customerType?: string; nationalCode?: string; economicCode?: string;
  paymentTermsDays?: number; sayadRequired?: boolean; deletedAt?: string; isDeleted?: boolean;
}
const extras = (a: Account) => a as Account & CustomerExtras;
const primaryPhone = (a: Account) => (a.phone || a.contacts?.find(c => c.isPrimary)?.phone || a.contacts?.find(c => c.phone || c.mobile)?.phone || a.contacts?.find(c => c.mobile)?.mobile || '').trim();
const hasReach = (a: Account) => Boolean(primaryPhone(a));
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'فعال', INACTIVE: 'غیرفعال', SUSPENDED: 'معلق', BLOCKED: 'مسدود' };
const statusLabel = (s?: string) => (s ? STATUS_LABELS[s] ?? getPersianStatusLabel(s) : 'نامشخص');
const TYPE_LABELS: Record<string, string> = { LEGAL: 'حقوقی', INDIVIDUAL: 'حقیقی' };
const fa = (n: number) => n.toLocaleString('fa-IR');

export function CustomersWorkspace({ state, updateState }: CustomersWorkspaceProps) {
  const { can, canOn, denied } = useCan(state, updateState);
  // مانده بدهی داده مالی است: فقط با مجوز finance.view محاسبه و نمایش داده می‌شود (F0-05)
  const canSeeBalance = can('finance', 'VIEW');
  // مانده = Σ بدهکار − Σ بستانکار به‌ازای (تفصیلی × معین) از مسیر DataProvider (نه خواندن مستقیم state)؛ بدون مجوز مالی اصلاً درخواست نمی‌شود
  const journalLineCount = Array.isArray((state as { journalLines?: unknown[] }).journalLines) ? (state as { journalLines?: unknown[] }).journalLines!.length : 0;
  const { scope: ledgerScope } = useLedgerBookScope();
  const { serverVersion, isSqlActive } = useDataSyncStatus();
  const ledgerKey = JSON.stringify([state.currentUserId, ledgerScope, serverVersion, journalLineCount]);
  const { data: balanceQuery, error: balancesError } = useDataQuery(
    async provider => canSeeBalance ? { key: ledgerKey, balances: await provider.getDetailSubsidiaryBalances(
      provider.name==='SQLSERVER_BACKEND' ? { ...ledgerScope, role:'RECEIVABLE' } : undefined
    ) } : null,
    [canSeeBalance, ledgerKey]
  );
  const detailBalances = canSeeBalance && balanceQuery?.key===ledgerKey ? balanceQuery.balances : null;
  const ledgerSearch = ledgerScope ? new URLSearchParams({ ledgerSource:ledgerScope.source, ledgerCurrency:ledgerScope.currency }).toString() : '';
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<FilterSelection>({});
  useDeepLinkCreate(() => setShowCreateModal(true), can('accounts', 'CREATE'));

  useEffect(() => {
    if (!successNotice) return;
    const t = window.setTimeout(() => setSuccessNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [successNotice]);

  const mayViewAccount = (account: Account) => canOn('accounts', 'VIEW', {
    ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId,
    teamId: account.teamId, tenantId: account.tenantId,
    deletedAt: extras(account).deletedAt, isDeleted: extras(account).isDeleted
  });
  const visibleAccounts = useMemo(() => activeRecords(state.accounts).filter(mayViewAccount), [state.accounts, canOn]);

  const userName = useMemo(() => new Map((state.users || []).map(u => [u.id, u.name] as const)), [state.users]);
  const [rawCustomerId] = location.pathname.split('/').filter(Boolean).slice(1);
  let urlCustomerId = rawCustomerId;
  try { if (rawCustomerId) urlCustomerId = decodeURIComponent(rawCustomerId); } catch { /* keep malformed ids unavailable */ }
  const listAccount = urlCustomerId ? visibleAccounts.find(account => account.id === urlCustomerId) : undefined;
  const detailQuery = useDataQuery(async provider => urlCustomerId && !listAccount
    ? { id: urlCustomerId, viewer: state.currentUserId, account: await provider.getAccountById(urlCustomerId) } : null,
  [urlCustomerId, !!listAccount, state.currentUserId]);
  const remoteDetail = !detailQuery.loading && !detailQuery.error && detailQuery.data?.id === urlCustomerId
    && detailQuery.data?.viewer === state.currentUserId ? detailQuery.data?.account : undefined;
  const selectedCustomer = listAccount || (remoteDetail && mayViewAccount(remoteDetail) ? remoteDetail : undefined);

  const listScroll = useRef<number | null>(null);
  const triggerFocusId = useRef('');
  const searchInputId = useId();
  useLayoutEffect(() => {
    const area = document.getElementById('main-scroll-container');
    if (!area) return;
    if (urlCustomerId) area.scrollTop = 0;
    else if (listScroll.current !== null) {
      area.scrollTop = listScroll.current;
      listScroll.current = null;
      (document.getElementById(triggerFocusId.current) ?? document.getElementById(searchInputId))?.focus({ preventScroll: true });
      triggerFocusId.current = '';
    }
  }, [urlCustomerId, searchInputId]);

  const openCustomer = (account: Account) => {
    listScroll.current = document.getElementById('main-scroll-container')?.scrollTop ?? 0;
    triggerFocusId.current = document.activeElement?.id || '';
    updateState(draft => { draft.activeContextAccountId = account.id; draft.activeContextCustomerId = account.id; });
    navigate({ pathname:`/accounts/${encodeURIComponent(account.id)}`, search:ledgerSearch }, { state: { returnToCustomerList: true } });
  };
  const goBackToCustomers = () => {
    updateState(draft => { draft.activeContextAccountId = null; draft.activeContextCustomerId = null; });
    if (location.state?.returnToCustomerList === true) navigate(-1);
    else navigate({ pathname:'/accounts', search:ledgerSearch }, { replace: true });
  };

  const handleDynamicFormSubmit = (formValues: Record<string, any>) => {
    if (!can('accounts', 'CREATE')) return denied('ایجاد پرونده موقت مشتری');
    if (!requireActiveUser(state, updateState, 'ایجاد پرونده موقت مشتری')) return;
    const creator = state.users?.find(u => u.id === state.currentUserId);
    if (!creator) return;

    const newId = generateId();
    const customerName = String(formValues.name || '').trim();
    if (!customerName) return;
    // پیش از ثبت: تطبیق با مشتریان موجود (ERP/محلی)؛ کد ملی/اقتصادی یکسان = مسدود، تلفن/نام یکسان = هشدار
    const matches = matchExistingCustomers(state.accounts || [], { name: customerName, phone: formValues.phone, nationalCode: formValues.nationalCode, economicCode: formValues.economicCode });
    const hard = matches.find(m => m.hard);
    if (hard) {
      const visibleMatch = visibleAccounts.find(account => account.id === hard.account.id);
      setSuccessNotice(visibleMatch
        ? `این مشتری قبلاً ثبت شده است («${visibleMatch.name}»). پروندهٔ موجود را باز کنید.`
        : 'امکان ثبت پرونده با مشخصات واردشده وجود ندارد. اطلاعات را بازبینی کنید.');
      return false;
    }
    const visibleMatches = matches.filter(match => visibleAccounts.some(account => account.id === match.account.id));
    const softWarn = visibleMatches.length ? ` هشدار: ${visibleMatches.length.toLocaleString('fa-IR')} مشتری با تلفن/نام مشابه وجود دارد؛ پیش از ارسال به ERP بررسی شود.` : '';
    const newAccount: Account = {
      id: newId,
      name: customerName,
      company: customerName,
      phone: formValues.phone ? String(formValues.phone).trim() : undefined,
      address: formValues.address ? String(formValues.address).trim() : undefined,
      creditLimit: Number.isFinite(Number(formValues.creditLimit)) && Number(formValues.creditLimit) > 0 ? Number(formValues.creditLimit) : undefined,
      status: 'ACTIVE',
      ownerId: creator.id,
      branchId: creator.branchId,
      territoryId: creator.territoryId,
      teamId: creator.teamId,
      tenantId: creator.tenantId,
      createdAt: new Date().toISOString(),
      customerType: formValues.customerType,
      nationalCode: formValues.nationalCode,
      nationalId: formValues.nationalCode,
      economicCode: formValues.economicCode,
      paymentTermsDays: Number(formValues.paymentTermsDays) || 30,
      sayadRequired: Boolean(formValues.sayadRequired),
      origin: 'CRM_LOCAL',
      isLocalDraft: true,
      erpProposalStatus: 'LOCAL_DRAFT',
      contacts: [{
        id: generateId(), name: customerName,
        title: formValues.customerType === 'LEGAL' ? 'نماینده رسمی' : 'مالک فروشگاه',
        phone: formValues.phone ? String(formValues.phone).trim() : undefined,
        isPrimary: true
      }]
    } as Account;

    updateState(draft => {
      if (!draft.accounts) draft.accounts = [];
      draft.accounts.unshift(newAccount);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(), action: 'CREATE', entityType: 'ACCOUNT', entityId: newId,
        details: `پیش‌نویس محلی مشتری «${customerName}» ثبت شد؛ کد رسمی فقط پس از تأیید ERP صادر می‌شود.`,
        actor: creator.name, createdAt: new Date().toISOString()
      });
    });
    void enqueueOptimisticMutation({
      action: 'CREATE',
      entityType: 'accounts',
      entityId: newId,
      payload: { ...newAccount },
      alwaysQueue: true,
    });
    setShowCreateModal(false);
    setSuccessNotice(`پیش‌نویس «${customerName}» در سامانه ثبت شد؛ هنوز مشتری رسمی نیست و پس از ارسال و تأیید ERP کد می‌گیرد.${softWarn}`);
  };

  const columns = useMemo<DataTableColumn<Account>[]>(() => [
    { id: 'name', header: 'مشتری', primary: true, minWidth: 240, value: a => a.name,
      render: a => <span className="flex items-center gap-2.5"><span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-black text-primary">{a.name?.charAt(0) || 'م'}</span><span className="min-w-0 truncate">{a.name}</span>{proposalStatusOf(a) === 'LOCAL_DRAFT' || proposalStatusOf(a) === 'PENDING_ERP_REVIEW' ? <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning" title={CUSTOMER_PROPOSAL_STATUS_LABEL[proposalStatusOf(a)!]}>پیش‌نویس</span> : null}</span> },
    { id: 'code', header: 'کد مشتری', minWidth: 110, value: a => a.code || '', render: a => a.code ? <span className="font-mono tabular-nums text-text-secondary">{a.code}</span> : <span className="text-text-muted">—</span> },
    { id: 'phone', header: 'تلفن', minWidth: 130, value: primaryPhone, render: a => primaryPhone(a) ? <a href={`tel:${primaryPhone(a)}`} dir="ltr" className="inline-flex items-center gap-1.5 font-mono tabular-nums text-text-main hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"><Phone size={12} aria-hidden="true" />{primaryPhone(a)}</a> : <span className="text-text-muted">—</span> },
    { id: 'contacts', header: 'مخاطب', align: 'end', minWidth: 80, value: a => a.contacts?.length ?? 0, render: a => <span className="tabular-nums text-text-secondary">{fa(a.contacts?.length ?? 0)}</span> },
    { id: 'owner', header: 'مسئول', minWidth: 120, value: a => (a.ownerId ? userName.get(a.ownerId) || '' : ''), render: a => (a.ownerId && userName.get(a.ownerId)) || <span className="text-text-muted">—</span> },
    { id: 'creditLimit', header: 'سقف اعتبار (ریال)', align: 'end', minWidth: 140, value: a => (typeof a.creditLimit === 'number' && a.creditLimit > 0 ? a.creditLimit : null), render: a => typeof a.creditLimit === 'number' && a.creditLimit > 0 ? <span className="font-mono tabular-nums">{fa(a.creditLimit)}</span> : <span className="text-text-muted">ثبت نشده</span> },
    { id: 'status', header: 'وضعیت', defaultHidden: true, value: a => statusLabel(a.status) },
    { id: 'terms', header: 'مهلت پرداخت (روز)', align: 'end', defaultHidden: true, value: a => (typeof extras(a).paymentTermsDays === 'number' ? extras(a).paymentTermsDays : null), render: a => typeof extras(a).paymentTermsDays === 'number' ? <span className="tabular-nums">{fa(extras(a).paymentTermsDays as number)}</span> : <span className="text-text-muted">—</span> },
    { id: 'createdAt', header: 'تاریخ ثبت', defaultHidden: true, value: a => a.createdAt || null, exportValue: a => a.createdAt || '', render: a => a.createdAt ? formatAppDate(a.createdAt, state.settings?.locale) : <span className="text-text-muted">—</span> }
  ], [userName, state.settings?.locale]);

  const filterGroups = useMemo<FilterGroup<Account>[]>(() => {
    const statuses = [...new Set(visibleAccounts.map(a => a.status || ''))].filter(Boolean);
    const owners = [...new Set(visibleAccounts.map(a => a.ownerId).filter((x): x is string => Boolean(x && userName.has(x))))];
    const groups: FilterGroup<Account>[] = [
      { id: 'reach', label: 'راه تماس', options: [{ value: 'yes', label: 'دارای شماره' }, { value: 'no', label: 'بدون شماره' }], predicate: (a, v) => (v === 'yes') === hasReach(a) },
      { id: 'contacts', label: 'مخاطب', options: [{ value: 'yes', label: 'دارای مخاطب' }, { value: 'no', label: 'بدون مخاطب' }], predicate: (a, v) => (v === 'yes') === Boolean(a.contacts?.length) }
    ];
    if (statuses.length > 1) groups.push({ id: 'status', label: 'وضعیت', options: statuses.map(s => ({ value: s, label: statusLabel(s) })), predicate: (a, v) => (a.status || '') === v });
    if (owners.length > 1) groups.push({ id: 'owner', label: 'مسئول', options: owners.map(o => ({ value: o, label: userName.get(o) || o })), predicate: (a, v) => a.ownerId === v });
    return groups;
  }, [visibleAccounts, userName]);

  const total = visibleAccounts.length;
  const withReach = visibleAccounts.filter(hasReach).length;
  const [activeChip, setActiveChip] = useState<'all' | 'reach' | 'risk'>('all');
  const [viewMode, setViewMode] = useState<'minimal' | 'table'>('minimal');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const searchListId = useId();
  const debouncedSearch = useDebouncedValue(searchQuery, SMART_SEARCH_DEBOUNCE_MS);

  const atRiskAccounts = useMemo(() => {
    return visibleAccounts.filter(a => {
      const hasRecentActivity = (state.activities || []).some(act => act.accountId === a.id);
      return !hasRecentActivity && a.status === 'SUSPENDED';
    });
  }, [visibleAccounts, state.activities]);
  const atRiskCount = atRiskAccounts.length;

  const filteredAccounts = useMemo(() => {
    const list = activeChip === 'reach' ? visibleAccounts.filter(hasReach) : activeChip === 'risk' ? atRiskAccounts : visibleAccounts;
    if (!debouncedSearch.trim()) return list;
    return smartSearch(list, debouncedSearch, account => [
      { text: account.name, weight: 4 }, { text: account.code || '', weight: 3 },
      primaryPhone(account), account.company, account.address, account.email,
      ...(account.contacts || []).flatMap(contact => [contact.name, contact.phone, contact.mobile]),
    ]).map(result => result.item);
  }, [visibleAccounts, activeChip, atRiskAccounts, debouncedSearch]);

  const [directoryPage, setDirectoryPage] = useState(1);
  const directory = useDataQuery(async provider => {
    if (activeChip !== 'all' || !can('accounts', 'VIEW') || debouncedSearch.trim().length < 2) return null;
    return { query: debouncedSearch, viewer: state.currentUserId, result: await provider.searchAccountDirectory(debouncedSearch, directoryPage) };
  }, [activeChip, debouncedSearch, directoryPage, state.currentUserId, can('accounts', 'VIEW')]);
  const serverResults = !directory.loading && !directory.error && directory.data?.query === debouncedSearch
    && directory.data?.viewer === state.currentUserId && directory.data?.result?.page === directoryPage ? directory.data.result : null;
  const searchSuggestions = serverResults ? serverResults.items.filter(mayViewAccount) : filteredAccounts.slice(0, 6);

  const searchReady = searchQuery === debouncedSearch;
  const suggestionsOpen = searchFocused && searchReady && searchQuery.trim().length >= 2 && (searchSuggestions.length > 0 || !!serverResults && serverResults.page > 1);
  const activeIndex = Math.min(suggestionIndex, Math.max(0, searchSuggestions.length - 1));
  const openSuggestion = (account: Account) => {
    setSearchFocused(false);
    openCustomer(account);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`;
    return name.slice(0, 2);
  };

  if (selectedCustomer) {
    return <Customer360 customer={selectedCustomer} state={state} updateState={updateState} onBack={goBackToCustomers} />;
  }
  if (urlCustomerId && detailQuery.loading) return <LoadingState label="در حال دریافت پروندهٔ مشتری" />;
  if (urlCustomerId && !selectedCustomer) {
    return <div className="p-6" dir="rtl"><EmptyState surface="customers_workspace_1" icon={<ShieldAlert className="w-9 h-9 text-text-secondary" />} title="پرونده در دسترس نیست" description="این حساب وجود ندارد، غیرفعال شده یا خارج از محدوده دسترسی شماست." actionLabel="بازگشت به فهرست" onAction={goBackToCustomers} /></div>;
  }

  const renderDetail = (a: Account) => {
    const x = extras(a);
    return <>
      <DetailGroup title="وضعیت پرونده">
        <DetailField label="کد مشتری">{a.code ? <span className="font-mono">{a.code}</span> : '—'}</DetailField>
        <DetailField label="وضعیت">{statusLabel(a.status)}</DetailField>
      </DetailGroup>
      <DetailGroup title="هویت">
        <DetailField label="نوع">{x.customerType ? TYPE_LABELS[x.customerType] || x.customerType : '—'}</DetailField>
        <DetailField label="شناسه/کد ملی"><span className="font-mono">{x.nationalCode || '—'}</span></DetailField>
        <DetailField label="کد اقتصادی"><span className="font-mono">{x.economicCode || '—'}</span></DetailField>
      </DetailGroup>
      <DetailGroup title="ارتباط">
        <DetailField label="تلفن">{primaryPhone(a) ? <a href={`tel:${primaryPhone(a)}`} dir="ltr" className="font-mono text-primary underline-offset-4 hover:underline">{primaryPhone(a)}</a> : '—'}</DetailField>
        <DetailField label="ایمیل">{a.email ? <a href={`mailto:${a.email}`} dir="ltr" className="text-primary underline-offset-4 hover:underline">{a.email}</a> : '—'}</DetailField>
        <DetailField label="نشانی">{a.address || '—'}</DetailField>
      </DetailGroup>
      <ProgressiveDisclosure
        className="my-2"
        summary={
          <span className="text-xs font-bold text-text-main">
            مخاطبین و شرایط تجاری ({fa(a.contacts?.length ?? 0)} مخاطب)
          </span>
        }
      >
        <DetailGroup title={`مخاطبین (${fa(a.contacts?.length ?? 0)})`}>
          {a.contacts?.length ? a.contacts.map(c => <DetailField key={c.id} label={c.title || c.role || (c.isPrimary ? 'اصلی' : 'مخاطب')}>{c.name}{(c.mobile || c.phone) && <> · <span dir="ltr" className="font-mono">{c.mobile || c.phone}</span></>}</DetailField>) : <p className="text-sm text-text-secondary">مخاطبی ثبت نشده است.</p>}
        </DetailGroup>
        <DetailGroup title="شرایط تجاری ثبت‌شده">
          <DetailField label="سقف اعتبار">{typeof a.creditLimit === 'number' && a.creditLimit > 0 ? <span className="font-mono">{fa(a.creditLimit)} ریال</span> : 'ثبت نشده'}</DetailField>
          <DetailField label="مهلت پرداخت">{typeof x.paymentTermsDays === 'number' ? `${fa(x.paymentTermsDays)} روز` : '—'}</DetailField>
          <DetailField label="چک صیادی">{typeof x.sayadRequired === 'boolean' ? (x.sayadRequired ? 'الزامی' : 'غیرالزامی') : '—'}</DetailField>
        </DetailGroup>
      </ProgressiveDisclosure>
      <DetailGroup title="ثبت">
        <DetailField label="مسئول">{(a.ownerId && userName.get(a.ownerId)) || '—'}</DetailField>
        <DetailField label="تاریخ ثبت">{a.createdAt ? formatAppDate(a.createdAt, state.settings?.locale) : '—'}</DetailField>
      </DetailGroup>
    </>;
  };

  return (
    <main className="crm-page crm-page-customers w-full min-h-full space-y-3 px-2 py-1 pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans sm:px-4" dir="rtl">
      {successNotice && <div role="status" className="se-rise-in flex items-start gap-2 rounded-xl border border-primary/20 bg-primary-soft px-3 py-2 text-xs font-semibold text-text-main shadow-xs"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{successNotice}</span></div>}

      <h1 className="sr-only">فهرست مشتریان و طرف‌های حساب</h1>
      {canSeeBalance && isSqlActive && <LedgerBookSourceSelect viewer={state.currentUserId} />}
      <div className="relative z-20 w-full" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false); }}>
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <InputControl
          id={searchInputId}
          type="search"
          role="combobox"
          aria-label="جست‌وجوی مشتریان در محدودهٔ دسترسی"
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen}
          aria-controls={suggestionsOpen ? searchListId : undefined}
          aria-activedescendant={suggestionsOpen && searchSuggestions[activeIndex] ? `${searchListId}-${activeIndex}` : undefined}
          className="ps-9"
          value={searchQuery}
          onFocus={() => setSearchFocused(true)}
          onChange={event => { setSearchQuery(event.target.value); setDirectoryPage(1); setSuggestionIndex(0); setSearchFocused(true); }}
          onKeyDown={event => {
            if (event.key === 'Escape' && suggestionsOpen) { event.preventDefault(); setSearchFocused(false); }
            if (!suggestionsOpen) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setSuggestionIndex(Math.max(0, Math.min(searchSuggestions.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1))));
            }
            if (event.key === 'Enter' && searchSuggestions[activeIndex] && !event.nativeEvent.isComposing) {
              event.preventDefault();
              openSuggestion(searchSuggestions[activeIndex]);
            }
          }}
          placeholder="نام، کد، شماره تماس یا نشانی"
        />
        {suggestionsOpen && (
          <div className="absolute inset-x-0 top-[calc(100%+6px)] rounded-xl border border-border bg-surface shadow-floating">
          <div id={searchListId} role="listbox" aria-label="نتایج جست‌وجوی مشتری" className="max-h-56 overflow-y-auto rounded-xl">
            {searchSuggestions.map((account, index) => (
              <button key={account.id} id={`${searchListId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === activeIndex}
                onMouseDown={event => event.preventDefault()} onClick={() => openSuggestion(account)}
                className={cn('flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-start last:border-0 hover:bg-canvas', index === activeIndex && 'bg-primary-soft')}>
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">{getInitials(account.name)}</span>
                <span className="min-w-0 flex-1"><strong className="block wrap-break-word text-xs text-text-main">{account.name}</strong><span className="mt-0.5 block wrap-break-word text-micro text-text-secondary">{account.code ? <bdi>{account.code}</bdi> : account.address || 'پروندهٔ مشتری'}</span></span>
                <ArrowUpLeft size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
              </button>
            ))}
          </div>
            {serverResults && (serverResults.page > 1 || serverResults.hasMore) && <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1">
              <Button type="button" size="sm" variant="ghost" disabled={serverResults.page <= 1}
                onClick={() => { setDirectoryPage(page => page - 1); setSuggestionIndex(0); document.getElementById(searchInputId)?.focus(); }}>نتایج قبلی</Button>
              <Button type="button" size="sm" variant="ghost" disabled={!serverResults.hasMore}
                onClick={() => { setDirectoryPage(page => page + 1); setSuggestionIndex(0); document.getElementById(searchInputId)?.focus(); }}>نتایج بعدی</Button>
            </div>}
          </div>
        )}
      </div>

      {searchFocused && activeChip === 'all' && debouncedSearch.trim().length >= 2 && directory.error &&
        <p role="status" className="text-caption text-text-secondary">جست‌وجوی سرور در دسترس نیست. نتایج از مشتریان بارگذاری‌شده‌اند.</p>}

      <section id="acc-metrics" data-tour-primary data-tour-heading aria-label="خلاصه و فیلتر مشتریان در محدودهٔ دسترسی" className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <FilterChip active={activeChip === 'all'} className="shrink-0" onClick={() => { setActiveChip('all'); setSelection({}); }} >
          <span>همه</span>
          <span className="opacity-80 font-mono text-micro">{fa(total)}</span>
        </FilterChip>

        <FilterChip active={activeChip === 'reach'} className="shrink-0" onClick={() => { setActiveChip('reach'); setSelection({}); }} >
          <span>دارای شماره تماس</span>
          <span className="opacity-80 font-mono text-micro">{fa(withReach)}</span>
        </FilterChip>

        <FilterChip active={activeChip === 'risk'} className="shrink-0" onClick={() => { setActiveChip('risk'); setSelection({}); }} >
          <span>در معرض ریسک</span>
          <span className="opacity-80 font-mono text-micro">{fa(atRiskCount)}</span>
        </FilterChip>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="نمای مشتریان">
          <FilterChip active={viewMode === 'minimal'} label="فهرست" onClick={() => setViewMode('minimal')} />
          <FilterChip active={viewMode === 'table'} label="جدول" onClick={() => setViewMode('table')} />
          {viewMode === 'minimal' && <RecordTaskAction state={state} updateState={updateState} accounts={visibleAccounts} />}
        </div>
      </section>

      {/* فهرست ردیف‌های مینیمال ۶۰ پیکسلی مشتریان */}
      {viewMode === 'minimal' ? (
        <div id="customer-table" data-tour-primary className="rounded-lg bg-surface border border-border/80 overflow-hidden divide-y divide-border/50">
          {filteredAccounts.length === 0 ? (
            <EmptyState surface="customers_workspace_2" title="مشتری‌ای مطابق فیلتر یافت نشد" description="عبارت جستجو یا فیلتر را تغییر دهید، یا مشتری جدید ثبت کنید." compact />
          ) : (
            filteredAccounts.map(account => {
              const initials = getInitials(account.name);
              const reach = primaryPhone(account);
              const view = canSeeBalance
                ? (balancesError ? ({ kind: 'UNAVAILABLE' } as const) : (detailBalances === null || detailBalances === undefined ? ({ kind: 'LOADING' } as const) : resolveCustomerBalanceView(detailBalances, account)))
                : null;
              const balance = view && view.kind === 'OK' ? view.total : null;
              const balanceHint = !view ? '' : view.kind === 'OK'
                ? `${balance! > 0 ? 'بدهکار' : balance! < 0 ? 'بستانکار' : 'تسویه'}${view.subsidiaryCount ? ` · ${fa(view.subsidiaryCount)} معین` : ''}${view.incomplete ? ' · فاقد نگاشت' : ''}`
                : view.kind === 'LOADING' ? 'در حال دریافت' : view.kind === 'UNAVAILABLE' ? 'منبع مانده در دسترس نیست' : 'مانده نامشخص';

              return (
                <motion.div
                  key={account.id}
                  id={`customer-row-${account.id}`}
                  layoutId={`account-card-${account.id}`}
                  onClick={() => openCustomer(account)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCustomer(account); } }}
                  role="button" tabIndex={0} aria-label={`مشاهده پرونده ${account.name}`}
                  className="min-h-(--size-60) px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-canvas/60 active:bg-canvas cursor-pointer transition-colors se-pressable se-hover-lift"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center border border-primary/20 shrink-0">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <strong className="block wrap-break-word text-body font-bold text-text-main">
                        {account.name}
                      </strong>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2 text-mini text-text-secondary">
                        {reach && <bdi className="font-mono">{reach}</bdi>}
                        {account.address && <span className="flex min-w-0 items-center gap-1 truncate"><MapPin size={10}/><span className="truncate">{account.address}</span></span>}
                      </div>
                    </div>
                  </div>

                  {canSeeBalance && (
                  <div className="text-end shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Wallet size={13} className="text-text-muted"/>
                      <div>
                        <span className="text-body font-mono font-bold tabular-nums block text-text-main">{balance === null ? '—' : fa(Math.abs(balance))} <span className="text-tiny font-normal text-text-secondary">{balance === null ? '' : 'ریال'}</span></span>
                        <span className="text-tiny text-text-secondary block">{balanceHint}</span>
                      </div>
                    </div>
                  </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      ) : (
        <div id="customer-table" data-tour-primary>
        <DataTable<Account>
          tableId="customers" savedFiltersScope={state.currentUserId || undefined} title="مشتریان و پرونده‌های تجاری"
          rows={filteredAccounts} columns={columns} getRowId={a => a.id} hideSearch
          filterGroups={filterGroups} selection={selection} onSelectionChange={setSelection}
          defaultSort={{ columnId: 'name', direction: 'asc' }} summary={null}
          exportFileName="customers" selectable renderDetail={renderDetail}
          renderTaskAction={selectedRows => <RecordTaskAction
            state={state} updateState={updateState} accounts={visibleAccounts} selectedCount={selectedRows.length}
            record={selectedRows.length === 1 ? { type: 'ACCOUNT', id: selectedRows[0].id, display: selectedRows[0].name, accountId: selectedRows[0].id } : undefined}
          />}
          detailTitle={a => a.name}
          detailFooter={a => <div className="flex gap-2">
            <button type="button" onClick={() => openCustomer(a)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-extrabold text-on-primary">پرونده ۳۶۰ درجه<ChevronLeft size={15} aria-hidden="true" /></button>
          </div>}
          emptyTitle="مشتری‌ای در محدوده دسترسی نیست"
          emptyDescription="برای شروع، مشتری جدید ثبت کنید یا عبارت جست‌وجو و فیلترها را تغییر دهید."
        />
        </div>
      )}

      {showCreateModal && <Modal isOpen onClose={() => setShowCreateModal(false)} title="ثبت مشتری جدید" subtitle="پرونده مشتری در بانک اطلاعاتی سامانه ثبت می‌شود." size="2xl">
        <DynamicFormRenderer schema={CUSTOMER_FORM_SCHEMA} initialValues={{ customerType: 'LEGAL', creditLimit: '', paymentTermsDays: '30', sayadRequired: true }} onSubmit={handleDynamicFormSubmit} onCancel={() => setShowCreateModal(false)} submitLabel="ثبت مشتری" />
      </Modal>}
    </main>
  );
}
