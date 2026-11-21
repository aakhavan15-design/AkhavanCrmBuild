import { BottomSheet } from './ui/BottomSheet';
import { PageToolbar } from './ui/PageToolbar';
import { requireActiveUser, useCan } from '../hooks/useCan';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppState, Opportunity, OpportunityStage, ID } from '../types';
import { TrendingUp, Calendar, Building2 } from 'lucide-react';
import { formatCurrency, generateId, formatAppDate } from '../lib/utils';
import { emitBusinessEvent } from '../lib/events';
import { Card } from './ui/Card';
import { FilterChip } from './ui/Tabs';
import { EmptyState } from './ui/EmptyState';
import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { OPPORTUNITY_FORM_SCHEMA, DynamicFormSchema } from '../services/dynamicFormEngine';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { Button } from './ui/Button';
import { OPPORTUNITY_STAGES, PIPELINE_FILTER_ALL } from '../config/pipeline';
import { activeRecords } from '../lib/recordLifecycle';
import { VerdictStrip } from './shared/VerdictStrip';

export function NegotiationsWorkspace({ state, updateState }: { state: AppState; updateState: (updater: (draft: AppState) => AppState | void) => void; setActiveTab?: (tab: Record<string, unknown>) => void; }) {
  const { can, canOn, denied } = useCan(state, updateState);
  const navigate = useNavigate();
  const [activeStage, setActiveStage] = useState<string>('ALL');
  const [oppQuery, setOppQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const opportunities = useMemo(() => activeRecords(state.opportunities).filter(o => canOn('opportunities', 'VIEW', {
    ownerId: o.ownerId, branchId: o.branchId, territoryId: o.territoryId, teamId: o.teamId, tenantId: o.tenantId
  })), [state.opportunities, canOn]);
  const visibleAccounts = useMemo(() => activeRecords(state.accounts).filter(account => canOn('accounts', 'VIEW', {
    ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId, teamId: account.teamId, tenantId: account.tenantId
  })), [state.accounts, canOn]);

  const stages = [
    PIPELINE_FILTER_ALL.opportunities,
    ...OPPORTUNITY_STAGES,
  ];

  const filtered = useMemo(() => {
    const q = oppQuery.trim().toLowerCase();
    return opportunities.filter(o => (activeStage === 'ALL' || o.stage === activeStage) &&
      (!q || String(o.title || '').toLowerCase().includes(q) || String(visibleAccounts.find(a => a.id === o.accountId)?.name || '').toLowerCase().includes(q)));
  }, [opportunities, activeStage, oppQuery, visibleAccounts]);

  const totalValue = filtered.reduce((sum, o) => sum + (o.amount || 0), 0);
  const wonCount = opportunities.filter(o => o.stage === 'WON').length;
  const inNegotiationCount = opportunities.filter(o => o.stage === 'NEGOTIATION').length;

  useDeepLinkCreate(() => setShowNewModal(true), can('opportunities', 'CREATE'));

  const opportunitySchema: DynamicFormSchema = useMemo(() => ({
    ...OPPORTUNITY_FORM_SCHEMA,
    fields: [
      { id: 'accountId', name: 'accountId', label: 'حساب تجاری مربوطه', type: 'select', options: visibleAccounts.map(a => ({ value: a.id, label: a.name })), validation: { required: true }, colSpan: 2 } as Record<string, unknown>,
      ...OPPORTUNITY_FORM_SCHEMA.fields.map(f => (f.name === 'stage' ? { ...f, options: (f.options || []).filter(o => ['DISCOVERY', 'PROPOSAL', 'NEGOTIATION'].includes(String(o.value))) } : f)),
    ],
  }), [visibleAccounts]);

  const handleCreateOpportunity = (values: Record<string, unknown>) => {
    if (!can('opportunities', 'CREATE')) return denied('ثبت فرصت تجاری');
    if (!requireActiveUser(state, updateState, 'ثبت فرصت تجاری')) return;
    const accountId = String(values.accountId || '');
    if (!visibleAccounts.some(account => account.id === accountId)) return denied('انتخاب حساب خارج از محدوده مجاز');
    const title = String(values.title ?? '').trim();
    const amount = Number(values.amount);
    if (!title || !Number.isFinite(amount) || amount <= 0) return;

    const creator = state.users.find(user => user.id === state.currentUserId);
    const newOpp: Opportunity = {
      id: generateId(),
      accountId,
      title,
      amount,
      stage: (values.stage || 'DISCOVERY') as OpportunityStage,
      expectedCloseDate: values.expectedCloseDate,
      ownerId: state.currentUserId!,
      branchId: creator?.branchId, territoryId: creator?.territoryId, teamId: creator?.teamId, tenantId: creator?.tenantId,
      createdAt: new Date().toISOString()
    };

    updateState(draft => {
      if (!draft.opportunities) draft.opportunities = [];
      draft.opportunities.unshift(newOpp);
    });

    emitBusinessEvent('OPPORTUNITY_CREATED', 'OPPORTUNITY', newOpp.id, newOpp, state, updateState);
    setShowNewModal(false);
  };

  const handleUpdateStage = (oppId: ID, stage: OpportunityStage) => {
    if (!can('opportunities', 'EDIT')) return denied('تغییر مرحله فرصت');
    if (!requireActiveUser(state, updateState, 'تغییر مرحله فرصت')) return;
    const current = opportunities.find(item => item.id === oppId);
    if (!current || current.stage === 'WON' || current.stage === 'LOST') return;
    const at = new Date().toISOString();
    updateState(draft => {
      const opp = (draft.opportunities || []).find((o: Record<string, unknown>) => o.id === oppId);
      if (!opp || opp.stage === 'WON' || opp.stage === 'LOST') return;
      opp.stage = stage;
      opp.updatedAt = at;
      if (stage === 'WON') opp.closedAt = at;
      if (stage === 'LOST') opp.closedAt = at;
    });
    emitBusinessEvent('OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY', current.id, { ...current, stage }, state, updateState);
  };

  return (
    <div className="crm-page crm-page-sales flex-1 flex flex-col bg-transparent font-sans" dir="rtl">
      
      {/* نوار ابزار و هدر */}
      <div id="opp-toolbar" data-tour-actions className="shrink-0 bg-transparent px-2 sm:px-4 pt-1 pb-2 space-y-2 z-10">
        <div className="flex justify-between items-center">
          <div>
            <h2 data-tour-heading className="text-sm sm:text-base font-bold text-text-main flex items-center gap-1.5">
              <TrendingUp size={16} className="text-primary" /> میز مذاکره و پایپ‌لاین فرصت‌های فروش
            </h2>
            <span className="text-caption text-text-secondary mt-0.5 block">
              ارزش فیلتر جاری: <strong className="font-mono text-primary">{formatCurrency(totalValue)} ریال</strong>
            </span>
          </div>
        </div>

        {/* نوار حکم ۸ ثانیه‌ای */}
        <VerdictStrip
          verdict={inNegotiationCount > 0 ? `${inNegotiationCount} معامله در مرحله حساس مذاکره نهایی قرار دارد` : `پایپ‌لاین فروش در گردش طبیعی است`}
          magnitude={`${wonCount} قرارداد موفق ثبت‌شده`}
          tone={inNegotiationCount > 0 ? 'warning' : 'success'}
          actionLabel="مذاکرات نهایی"
          onAction={() => setActiveStage('NEGOTIATION')}
        />

        <PageToolbar 
          search={oppQuery} 
          onSearchChange={setOppQuery} 
          searchPlaceholder="جستجوی عنوان فرصت یا نام مشتری..." 
          resultCount={filtered.length}
          activeFilters={activeStage !== 'ALL' ? [{ key: 'stage', label: stages.find(s => s.id === activeStage)?.label || activeStage, onRemove: () => setActiveStage('ALL') }] : []}
          onClearAll={() => { setOppQuery(''); setActiveStage('ALL'); }} 
        />

        {/* چیپ‌های مرحله پایپ‌لاین */}
        <div id="opp-stages" data-tour-actions className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {stages.map(s => (
            <FilterChip 
              key={s.id} 
              label={s.label} 
              active={activeStage === s.id} 
              onClick={() => setActiveStage(s.id)} 
            />
          ))}
        </div>
      </div>

      {/* لیست فرصت‌ها */}
      <div id="opp-list" data-tour-primary className="flex-1 overflow-y-auto px-2 sm:px-4 pb-24 space-y-2 pt-1">
        {filtered.length > 0 ? (
          filtered.map(opp => {
            const acc = visibleAccounts.find(a => a.id === opp.accountId);
            const stageDef = stages.find(s => s.id === opp.stage);
            return (
              <div key={opp.id} className="p-3 rounded-xl border border-border bg-surface flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-bold text-text-main">{opp.title}</strong>
                    <span className={`px-2 py-0.5 text-micro font-bold rounded-md ${stageDef?.color || 'bg-canvas text-text-secondary'}`}>
                      {stageDef?.label || opp.stage}
                    </span>
                  </div>
                  <div className="text-caption text-text-secondary flex items-center gap-3">
                    {acc && (
                      <span className="flex items-center gap-1 font-medium text-text-main">
                        <Building2 size={11} className="text-text-secondary" /> {acc.name}
                      </span>
                    )}
                    {opp.expectedCloseDate && (
                      <span className="font-mono text-micro">
                        هدف: {formatAppDate(opp.expectedCloseDate, state.settings?.locale)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="text-left font-mono">
                    <strong className="text-xs font-bold text-primary block">{formatCurrency(opp.amount)} ریال</strong>
                  </div>

                  {opp.stage !== 'WON' && opp.stage !== 'LOST' && (
                    <div className="flex gap-1">
                      <Button variant="soft-success" size="xs" onClick={() => handleUpdateStage(opp.id, 'WON')} >
                        برنده
                      </Button>
                      <Button variant="soft-danger" size="xs" onClick={() => handleUpdateStage(opp.id, 'LOST')} >
                        باخت
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState surface="negotiations_workspace" 
            icon={<TrendingUp className="w-8 h-8 text-text-secondary opacity-50" />} 
            title="فرصتی یافت نشد" 
            description="فرصت تجاری جدید برای پیشبرد مذاکرات ثبت کنید." 
            actionLabel="فرصت جدید"
          />
        )}
      </div>

      <BottomSheet isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="ثبت فرصت تجاری جدید">
        <DynamicFormRenderer
          schema={opportunitySchema}
          initialValues={{
            accountId: visibleAccounts[0]?.id || '',
            stage: 'DISCOVERY',
            expectedCloseDate: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0]
          }}
          onSubmit={handleCreateOpportunity}
          onCancel={() => setShowNewModal(false)}
          submitLabel="ثبت فرصت"
        />
      </BottomSheet>
    </div>
  );
}
