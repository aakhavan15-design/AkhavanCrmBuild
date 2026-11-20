import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { LEAD_FORM_SCHEMA } from '../services/dynamicFormEngine';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { requireActiveUser, useCan } from '../hooks/useCan';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppState, Lead, LeadStage, ID, Account } from '../types';
import { generateId, matchesSearch } from '../lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Select, InputControl } from './ui/Input';
import { EmptyState } from './ui/EmptyState';
import { LEAD_STAGES, PIPELINE_FILTER_ALL } from '../config/pipeline';
import { activeRecords } from '../lib/recordLifecycle';
import { TrendIndicator } from './charts/TrendIndicator';
import { Sparkline } from './charts/Sparkline';
import { toPersianDigits } from '../lib/digits';
import { UserCheck, Phone, Clock, CheckCircle2, Search } from 'lucide-react';

interface LeadsWorkspaceProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  setActiveTab?: (tab: string) => void;
}

function buildLeadSeries(leads: Lead[], predicate: (l: Lead) => boolean, now: Date) {
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, count: 0 };
  });
  const byKey = new Map(buckets.map(b => [b.key, b]));
  leads.forEach(l => {
    if (!predicate(l)) return;
    const key = String(l.createdAt || '').slice(0, 7);
    const bucket = byKey.get(key);
    if (bucket) bucket.count += 1;
  });
  const values = buckets.map(b => b.count);
  const curr = values[values.length - 1] || 0;
  const prev = values[values.length - 2] || 0;
  const pctChange = prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;
  const hasVariance = values.filter(v => v > 0).length >= 2;
  return { values, pctChange, hasVariance };
}

export function LeadsWorkspace({ state, updateState }: LeadsWorkspaceProps) {
  const { can, canOn, denied } = useCan(state, updateState);
  const navigate = useNavigate();
  const [activeStage, setActiveStage] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  useDeepLinkCreate(() => setIsNewLeadOpen(true), can('leads', 'CREATE'));

  const stages: { id: string; label: string; color: string }[] = [
    PIPELINE_FILTER_ALL.leads,
    ...LEAD_STAGES,
  ];

  const visibleLeads = useMemo(
    () =>
      activeRecords(state.leads).filter((lead: Lead) =>
        canOn('leads', 'VIEW', {
          ownerId: lead.ownerId,
          branchId: lead.branchId,
          territoryId: lead.territoryId,
          teamId: lead.teamId,
          tenantId: lead.tenantId,
        })
      ),
    [state.leads, canOn]
  );

  const filteredLeads = useMemo(() => {
    let list = visibleLeads;
    if (activeStage !== 'ALL') {
      list = list.filter((l: Lead) => l.stage === activeStage);
    }
    if (searchQuery.trim()) {
      list = list.filter(
        (l: Lead) =>
          matchesSearch(l.companyName, searchQuery) ||
          matchesSearch(l.contactName, searchQuery) ||
          matchesSearch(l.phone, searchQuery)
      );
    }
    return list;
  }, [visibleLeads, activeStage, searchQuery]);

  const handleCreateLead = (values: Record<string, unknown>) => {
    if (!can('leads', 'CREATE')) return denied('ثبت سرنخ');
    if (!requireActiveUser(state, updateState, 'ثبت سرنخ')) return;
    const creator = state.users.find(user => user.id === state.currentUserId);
    const newLead: Lead = {
      id: generateId(),
      companyName: String(values.companyName || '').trim(),
      contactName: String(values.contactName || '').trim(),
      phone: String(values.phone || '').trim(),
      stage: 'NEW',
      ownerId: state.currentUserId!,
      branchId: creator?.branchId,
      territoryId: creator?.territoryId,
      teamId: creator?.teamId,
      tenantId: creator?.tenantId,
      notes: String(values.notes || '').trim(),
      createdAt: new Date().toISOString()
    };
    updateState(draft => {
      if (!draft.leads) draft.leads = [];
      draft.leads.unshift(newLead);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(),
        action: 'LEAD_CREATED',
        entityType: 'LEAD',
        entityId: newLead.id,
        details: `سرنخ جدید برای شرکت ${newLead.companyName} ثبت شد`,
        actor: state.users.find(u => u.id === state.currentUserId)?.name || 'System',
        createdAt: new Date().toISOString()
      });
    });
    setIsNewLeadOpen(false);
  };

  const handleUpdateStage = (leadId: ID, nextStage: LeadStage) => {
    if (!can('leads', 'EDIT')) return denied('تغییر مرحله سرنخ');
    updateState(draft => {
      const lead = (draft.leads || []).find((l: Lead) => l.id === leadId);
      if (lead) {
        lead.stage = nextStage;
      }
    });
  };

  const handleConvertLeadToAccount = (lead: Lead) => {
    if (!can('leads', 'EDIT') || !can('accounts', 'CREATE')) return denied('تبدیل سرنخ به مشتری');
    if (!requireActiveUser(state, updateState, 'تبدیل سرنخ به مشتری')) return;

    const linkedAccount = (state.accounts || []).find(
      account =>
        !account.deletedAt &&
        !account.deletedAtUtc &&
        account.isDeleted !== true &&
        (account.id === lead.convertedAccountId || account.sourceLeadId === lead.id)
    );
    if (linkedAccount) {
      updateState(draft => {
        const currentLead = (draft.leads || []).find((item: Lead) => item.id === lead.id);
        if (currentLead) {
          currentLead.stage = 'CONVERTED';
          currentLead.convertedAccountId = linkedAccount.id;
          currentLead.convertedAt ||= new Date().toISOString();
        }
        draft.activeContextAccountId = linkedAccount.id;
        draft.activeContextCustomerId = linkedAccount.id;
      });
      navigate(`/accounts/${linkedAccount.id}`);
      return;
    }

    const newAccountId = generateId();
    const nowIso = new Date().toISOString();
    let resolvedAccountId = newAccountId;
    updateState(draft => {
      const currentLead = (draft.leads || []).find((item: Lead) => item.id === lead.id);
      const existing = (draft.accounts || []).find(
        (account: Account) =>
          !account.deletedAt &&
          !account.deletedAtUtc &&
          account.isDeleted !== true &&
          (account.id === currentLead?.convertedAccountId || account.sourceLeadId === lead.id)
      );
      if (existing) {
        resolvedAccountId = existing.id;
        if (currentLead) {
          currentLead.stage = 'CONVERTED';
          currentLead.convertedAccountId = existing.id;
          currentLead.convertedAt ||= nowIso;
        }
      } else {
        const newAccount: Account = {
          id: newAccountId,
          name: lead.companyName,
          origin: 'CRM_LOCAL',
          isLocalDraft: true,
          erpProposalStatus: 'LOCAL_DRAFT',
          status: 'ACTIVE',
          phone: lead.phone,
          active: true,
          sourceLeadId: lead.id,
          createdAt: nowIso,
          contacts: [{ id: generateId(), accountId: newAccountId, name: lead.contactName, phone: lead.phone, isPrimary: true }]
        };
        if (!draft.accounts) draft.accounts = [];
        draft.accounts.unshift(newAccount);
        if (currentLead) {
          currentLead.stage = 'CONVERTED';
          currentLead.convertedAccountId = newAccountId;
          currentLead.convertedAt = nowIso;
        }
        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.push({
          id: generateId(),
          action: 'LEAD_CONVERTED',
          entityType: 'LEAD',
          entityId: lead.id,
          details: `سرنخ ${lead.companyName} به پیش‌نویس حساب مشتری تبدیل شد`,
          actor: state.users.find(u => u.id === state.currentUserId)?.name || 'System',
          createdAt: nowIso
        });
      }
      draft.activeContextAccountId = resolvedAccountId;
      draft.activeContextCustomerId = resolvedAccountId;
    });
    navigate(`/accounts/${resolvedAccountId}`);
  };

  const now = new Date();
  const totalLeadsCount = visibleLeads.length;
  const newLeadsCount = visibleLeads.filter(l => l.stage === 'NEW').length;
  const qualifiedLeadsCount = visibleLeads.filter(l => l.stage === 'QUALIFIED').length;
  const convertedLeadsCount = visibleLeads.filter(l => l.stage === 'CONVERTED').length;

  const totalSeries = useMemo(() => buildLeadSeries(visibleLeads, () => true, now), [visibleLeads, now]);
  const newSeries = useMemo(() => buildLeadSeries(visibleLeads, l => l.stage === 'NEW', now), [visibleLeads, now]);
  const qualifiedSeries = useMemo(() => buildLeadSeries(visibleLeads, l => l.stage === 'QUALIFIED', now), [visibleLeads, now]);
  const convertedSeries = useMemo(() => buildLeadSeries(visibleLeads, l => l.stage === 'CONVERTED', now), [visibleLeads, now]);

  return (
    <div className="w-full space-y-3.5 px-1 py-1 sm:px-3 sm:py-3 pb-24 font-premium" dir="rtl">
      <div id="leads-heading" data-tour-heading className="flex items-center justify-between">
        <div>
          <h2 data-tour-heading className="text-lg font-bold text-text-main tracking-tight flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" /> مدیریت سرنخ‌های فروش
          </h2>
          <span className="text-caption text-text-secondary">پایش صلاحیت‌سنجی و تبدیل به حساب تجاری</span>
        </div>
      </div>

      {/* کاشی‌های آمار سرنخ فقط از داده‌های واقعی */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-2xl bg-surface border border-border/50 flex flex-col justify-between shadow-2xs">
          <span className="text-micro font-medium text-text-secondary">کل سرنخ‌ها</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold text-text-main tabular-nums">{toPersianDigits(totalLeadsCount.toString())}</span>
            {totalSeries.pctChange !== null && <TrendIndicator value={totalSeries.pctChange} label="ماه قبل" />}
          </div>
          {totalSeries.hasVariance && (
            <div className="mt-1.5 h-3.5 w-full">
              <Sparkline data={totalSeries.values} color="var(--c-primary)" />
            </div>
          )}
        </div>

        <div className="p-2.5 rounded-2xl bg-surface border border-border/50 flex flex-col justify-between shadow-2xs">
          <span className="text-micro font-medium text-text-secondary">جدید و پیگیری</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold text-primary tabular-nums">{toPersianDigits(newLeadsCount.toString())}</span>
            {newSeries.pctChange !== null && <TrendIndicator value={newSeries.pctChange} />}
          </div>
          {newSeries.hasVariance && (
            <div className="mt-1.5 h-3.5 w-full">
              <Sparkline data={newSeries.values} color="var(--c-primary)" />
            </div>
          )}
        </div>

        <div className="p-2.5 rounded-2xl bg-surface border border-border/50 flex flex-col justify-between shadow-2xs">
          <span className="text-micro font-medium text-text-secondary">صلاحیت‌سنجی‌شده</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold text-text-main tabular-nums">{toPersianDigits(qualifiedLeadsCount.toString())}</span>
            {qualifiedSeries.pctChange !== null && <TrendIndicator value={qualifiedSeries.pctChange} />}
          </div>
          {qualifiedSeries.hasVariance && (
            <div className="mt-1.5 h-3.5 w-full">
              <Sparkline data={qualifiedSeries.values} color="var(--c-warning)" />
            </div>
          )}
        </div>

        <div className="p-2.5 rounded-2xl bg-surface border border-border/50 flex flex-col justify-between shadow-2xs">
          <span className="text-micro font-medium text-text-secondary">تبدیل به حساب</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{toPersianDigits(convertedLeadsCount.toString())}</span>
            {convertedSeries.pctChange !== null && <TrendIndicator value={convertedSeries.pctChange} />}
          </div>
          {convertedSeries.hasVariance && (
            <div className="mt-1.5 h-3.5 w-full">
              <Sparkline data={convertedSeries.values} color="var(--c-success)" />
            </div>
          )}
        </div>
      </div>

      <div id="leads-filters" data-tour-actions className="flex items-center justify-between gap-3 bg-surface p-2 rounded-xl border border-border/60">
        <label htmlFor="lead-stage-select" className="text-xs font-bold text-text-secondary whitespace-nowrap">
          مرحله سرنخ:
        </label>
        <Select
          density="compact"
          id="lead-stage-select"
          aria-label="مرحله سرنخ"
          value={activeStage}
          onChange={e => setActiveStage(e.target.value)}
          className="flex-1 max-w-(--size-260)"
        >
          {stages.map(stage => (
            <option key={stage.id} value={stage.id}>
              {stage.label} ({toPersianDigits(
                stage.id === 'ALL'
                  ? visibleLeads.length.toString()
                  : visibleLeads.filter(l => l.stage === stage.id).length.toString()
              )})
            </option>
          ))}
        </Select>
      </div>

      <div className="relative w-full">
        <InputControl
          type="text"
          placeholder="جستجوی شرکت یا مخاطب..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" size={15} />
      </div>

      <div id="leads-list" data-tour-primary className="space-y-3 pt-2">
        {filteredLeads.length > 0 ? (
          filteredLeads.map((lead: Lead) => {
            const stageDef = stages.find(s => s.id === lead.stage);
            return (
              <Card key={lead.id} padding="md" className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow border-border bg-white">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-bold text-text-main">{lead.companyName}</strong>
                    <span className={`px-2 py-0.5 text-micro font-bold rounded-md ${stageDef?.color}`}>
                      {stageDef?.label || lead.stage}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary flex flex-wrap gap-4 pt-1">
                    <span className="flex items-center gap-1 font-medium text-text-main">
                      مخاطب: {lead.contactName}
                    </span>
                    {lead.phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone size={12} className="text-text-secondary" /> {lead.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1 font-mono text-caption text-text-secondary">
                      <Clock size={12} /> {new Date(lead.createdAt).toLocaleDateString('fa-IR')}
                    </span>
                  </div>
                  {lead.notes && (
                    <p className="text-xs text-text-secondary bg-canvas p-2 rounded-lg mt-2 border border-border">
                      یادداشت: {lead.notes}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                  {lead.stage === 'NEW' && (
                    <Button variant="soft" size="sm" onClick={() => handleUpdateStage(lead.id, 'CONTACTED')}>
                      ثبت تماس اولیه
                    </Button>
                  )}

                  {lead.stage === 'CONTACTED' && (
                    <Button variant="soft-warning" size="sm" onClick={() => handleUpdateStage(lead.id, 'QUALIFIED')}>
                      تایید صلاحیت
                    </Button>
                  )}

                  {lead.stage === 'QUALIFIED' && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleConvertLeadToAccount(lead)}
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    >
                      تبدیل به پیش‌نویس حساب
                    </Button>
                  )}

                  {lead.stage === 'CONVERTED' && (
                    <span className="text-xs font-bold text-success bg-success-soft px-3 py-1 rounded-lg border border-success-line flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> حساب ایجاد شد
                    </span>
                  )}

                  {lead.stage !== 'CONVERTED' && lead.stage !== 'LOST' && (
                    <button
                      onClick={() => handleUpdateStage(lead.id, 'LOST')}
                      className="text-xs font-semibold px-2 py-1 text-text-secondary hover:text-danger rounded transition-colors cursor-pointer"
                      title="لغو / از دست رفته"
                    >
                      انصراف
                    </button>
                  )}
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState surface="leads_workspace"
            icon={<UserCheck className="w-8 h-8 text-text-secondary opacity-50" />}
            title="هیچ سرنخی یافت نشد"
            description="برای شروع، سرنخ جدید ثبت کنید یا عبارت جست‌وجو را تغییر دهید."
            actionLabel="ثبت سرنخ جدید"
            onAction={() => setIsNewLeadOpen(true)}
          />
        )}
      </div>

      <Modal isOpen={isNewLeadOpen} onClose={() => setIsNewLeadOpen(false)} title="ثبت سرنخ بازرگانی جدید">
        <DynamicFormRenderer schema={LEAD_FORM_SCHEMA} onSubmit={handleCreateLead} onCancel={() => setIsNewLeadOpen(false)} submitLabel="ثبت سرنخ" />
      </Modal>
    </div>
  );
}
