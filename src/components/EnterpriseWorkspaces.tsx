import React, { useMemo, useState } from 'react';
import { AppState, Case, Campaign, KnowledgeArticle } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Select, InputControl } from './ui/Input';
import { ShieldAlert, BookOpen, Megaphone, Plus, Building2, Search, FileText, ChevronLeft, Target, Filter, ArrowUpDown, CheckCircle2, PauseCircle, PlayCircle } from 'lucide-react';
import { generateId, formatAppDate, matchesSearch } from '../lib/utils';
import { enqueueJob } from '../lib/automation';
import { emitBusinessEvent } from '../lib/events';
import { EmptyState } from './ui/EmptyState';
import { useCan } from '../hooks/useCan';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { createCaseFormSchema, createCampaignFormSchema, createKnowledgeArticleFormSchema } from '../services/dynamicFormEngine';
import { getPersianStatusLabel } from '../lib/labels';
import { PageToolbar } from './ui/PageToolbar';

interface WorkspaceProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  setActiveTab?: (tab: string) => void;
}

export function CasesWorkspace({ state, updateState }: WorkspaceProps) {
  const { can, denied } = useCan(state, updateState);
  const cases = state.cases || [];
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);
  const [formError, setFormError] = useState('');

  useDeepLinkCreate(() => setIsNewCaseOpen(true));

  const caseFormSchema = createCaseFormSchema(state.accounts || []);
  const handleCreateCase = (values: Record<string, any>) => {
    if (!can('cases', 'CREATE')) return denied('ثبت تیکت پشتیبانی');
    if (!state.currentUserId) return;
    setFormError('');
    const caseSubject = String(values.subject || '').trim();
    const caseDesc = String(values.description || '').trim();
    const caseAccountId = String(values.accountId || '');
    const casePriority = (values.priority || 'NORMAL') as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    if (!caseSubject) return setFormError('موضوع پرونده الزامی است.');
    if (!caseAccountId) return setFormError('حساب مشتری مربوطه را انتخاب کنید.');

    const newCase: Case = {
      id: generateId(),
      caseNumber: `CS-${Date.now().toString().slice(-4)}`,
      accountId: caseAccountId,
      subject: caseSubject.trim(),
      description: caseDesc.trim(),
      status: 'NEW',
      priority: casePriority,
      ownerId: state.currentUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    updateState(draft => {
      if (!draft.cases) draft.cases = [];
      draft.cases.unshift(newCase);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(),
        action: 'CASE_CREATED',
        entityType: 'CASE',
        entityId: newCase.id,
        details: `پرونده خدمات ${newCase.caseNumber} با موضوع "${newCase.subject}" ایجاد شد`,
        actor: state.users?.find(u => u.id === state.currentUserId)?.name || 'System',
        createdAt: new Date().toISOString()
      });
    });

    setIsNewCaseOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-transparent" dir="rtl">
      <div id="cases-header" data-tour-heading className="shrink-0 p-4 sm:p-6 pb-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 data-tour-heading className="text-lg font-bold text-text-main flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> میز خدمات و پشتیبانی مشتریان
            </h2>
            <span className="text-xs text-text-secondary">مدیریت تیکت‌ها، شکایات و درخواست‌های پشتیبانی</span>
          </div>
          <Button variant="primary" onClick={() => setIsNewCaseOpen(true)} icon={<Plus className="w-4 h-4"/>}>
            مورد جدید
          </Button>
        </div>
      </div>
      
      <div id="cases-list" data-tour-primary className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 pb-24 space-y-3">
        {cases.length > 0 ? cases.map((c: any) => {
          const acc = state.accounts.find(a => a.id === c.accountId);
          return (
            <Card key={c.id} padding="md" className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:shadow-md transition-shadow bg-white border-border">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-bold text-text-main">{c.subject}</strong>
                  <span className={`px-2 py-0.5 text-micro font-bold rounded-md ${c.priority === 'URGENT' || c.priority === 'HIGH' ? 'bg-red-50 text-danger' : 'bg-canvas text-text-secondary'}`}>
                    {getPersianStatusLabel(c.priority)}
                  </span>
                </div>
                <div className="text-xs text-text-secondary flex items-center gap-3">
                  <span className="font-mono">{c.caseNumber}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-semibold text-text-main">
                    <Building2 size={12} className="text-text-secondary" /> {acc?.name || 'حساب نامشخص'}
                  </span>
                </div>
                {c.description && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{c.description}</p>}
              </div>
              <span className="px-2.5 py-1 text-micro font-bold bg-amber-50 text-warning rounded-lg shrink-0">
                {getPersianStatusLabel(c.status)}
              </span>
            </Card>
          );
        }) : (
          <EmptyState surface="enterprise_workspaces_1" 
            icon={<ShieldAlert className="w-8 h-8 text-text-secondary opacity-50" />} 
            title="موردی یافت نشد" 
            description="هیچ پرونده پشتیبانی در سیستم ثبت نشده است." 
            actionLabel="مورد جدید"
            onAction={() => setIsNewCaseOpen(true)}
          />
        )}
      </div>

      <Modal isOpen={isNewCaseOpen} onClose={() => setIsNewCaseOpen(false)} title="ثبت مورد خدمات / شکایت جدید">
        {formError && <div role="alert" className="mb-3 p-2 bg-red-50 text-danger rounded-lg font-bold">{formError}</div>}
        <DynamicFormRenderer
          schema={caseFormSchema}
          initialValues={{ accountId: state.activeContextAccountId || state.accounts[0]?.id || '', priority: 'NORMAL' }}
          onSubmit={handleCreateCase}
          onCancel={() => setIsNewCaseOpen(false)}
          submitLabel="ثبت پرونده"
        />
      </Modal>
    </div>
  );
}

export function CampaignsWorkspace({ state, updateState }: WorkspaceProps) {
  const { rbac, denied } = useCan(state, updateState);
  const campaigns = state.campaigns || [];
  const segments = state.segments || [];
  const canManage = rbac.hasPermission('marketing.manage');
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'>('ALL');
  const [sortBy, setSortBy] = useState<'RECENT' | 'OLDEST' | 'NAME'>('RECENT');
  const [selectedId, setSelectedId] = useState<string | null>(campaigns[0]?.id || null);

  useDeepLinkCreate(() => setIsNewCampaignOpen(true));

  const campaignFormSchema = createCampaignFormSchema(segments.map((segment: any) => ({ value: segment.id, label: segment.name })));

  const visibleCampaigns = useMemo(() => {
    const q = query.trim();
    const rows = campaigns.filter((campaign: Campaign) =>
      (statusFilter === 'ALL' || String(campaign.status).toUpperCase() === statusFilter) &&
      (!q || matchesSearch(`${campaign.name} ${campaign.description || ''} ${campaign.targetAudience || ''} ${campaign.id}`, q))
    );
    return rows.sort((a: Campaign, b: Campaign) => {
      if (sortBy === 'NAME') return a.name.localeCompare(b.name, 'fa');
      const delta = Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '');
      return sortBy === 'OLDEST' ? delta : -delta;
    });
  }, [campaigns, query, statusFilter, sortBy]);
  const selectedCampaign = visibleCampaigns.find((campaign: Campaign) => campaign.id === selectedId) || visibleCampaigns[0] || null;
  const activeCount = campaigns.filter((c: Campaign) => String(c.status).toUpperCase() === 'ACTIVE').length;
  const pausedCount = campaigns.filter((c: Campaign) => String(c.status).toUpperCase() === 'PAUSED').length;
  const completedCount = campaigns.filter((c: Campaign) => String(c.status).toUpperCase() === 'COMPLETED').length;
  const selectedSegment = selectedCampaign?.segmentId ? segments.find((s: any) => s.id === selectedCampaign.segmentId) : undefined;
  const selectedSegmentIsUsable = !!selectedSegment && selectedSegment.active === true;
  const pendingEvaluation = (state.jobs || []).some((job: any) => job.type === 'EVALUATE_DYNAMIC_CAMPAIGN' && job.payload?.campaignId === selectedCampaign?.id && ['PENDING', 'RUNNING', 'RETRYING'].includes(job.status));
  const campaignExecutions = selectedCampaign ? (state.campaignExecutions || []).filter((execution: any) => execution.campaignId === selectedCampaign.id) : [];
  const campaignFormInitial = { startDate: new Date().toISOString().slice(0, 10), endDate: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10), targetAudience: 'عموم مشتریان', segmentId: '' };

  const handleCreateCampaign = (values: Record<string, any>) => {
    if (!canManage) return denied('ایجاد کمپین');
    if (!state.currentUserId) return;
    setFormError('');
    const name = String(values.name || '').trim();
    const description = String(values.description || '').trim();
    const targetAudience = String(values.targetAudience || '').trim();
    const startDate = String(values.startDate || '');
    const endDate = String(values.endDate || '');
    const segmentId = String(values.segmentId || '').trim() || undefined;
    if (name.length < 3) return setFormError('نام کمپین باید حداقل ۳ نویسه باشد.');
    if (!startDate || !endDate) return setFormError('تاریخ شروع و پایان کمپین الزامی است.');
    if (new Date(startDate) > new Date(endDate)) return setFormError('تاریخ پایان کمپین باید بعد از تاریخ شروع باشد.');
    if (segmentId && !segments.some((segment: any) => segment.id === segmentId)) return setFormError('بخش‌بندی انتخاب‌شده معتبر نیست.');

    const newCamp: Campaign = {
      id: generateId(), name, description, targetAudience: targetAudience || 'مخاطبان تعریف‌شده در سگمنت',
      mode: segmentId ? 'DYNAMIC' : 'STATIC', startDate, endDate, status: 'ACTIVE', ownerId: state.currentUserId,
      executionCount: 0, segmentId, createdAt: new Date().toISOString()
    };
    updateState(draft => {
      if (!draft.campaigns) draft.campaigns = [];
      draft.campaigns.unshift(newCamp);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({ id: generateId(), action: 'CAMPAIGN_CREATED', entityType: 'CAMPAIGN', entityId: newCamp.id, details: `کمپین «${newCamp.name}» ایجاد شد.`, actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString() });
    });
    emitBusinessEvent('CAMPAIGN_CREATED', 'CAMPAIGN', newCamp.id, newCamp, state, updateState);
    setSelectedId(newCamp.id);
    setIsNewCampaignOpen(false);
  };

  const handleEvaluateAudience = (campaign: Campaign) => {
    if (!canManage) return denied('ارزیابی جامعه هدف کمپین');
    const segment = campaign.segmentId ? segments.find((s: any) => s.id === campaign.segmentId) : undefined;
    if (!segment || segment.active !== true) return;
    const dayKey = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `campaign-audience:${campaign.id}:${dayKey}`;
    const existing = (state.jobs || []).find((job: any) => job.idempotencyKey === idempotencyKey && ['PENDING', 'RUNNING', 'RETRYING', 'COMPLETED'].includes(job.status));
    if (existing) return;
    enqueueJob('EVALUATE_DYNAMIC_CAMPAIGN', { campaignId: campaign.id, idempotencyKey }, state, updateState);
    updateState(draft => {
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({ id: generateId(), action: 'CAMPAIGN_AUDIENCE_EVALUATION_QUEUED', entityType: 'CAMPAIGN', entityId: campaign.id, details: `ارزیابی محلی سگمنت «${segment.name}» در صف قرار گرفت؛ ارسال پیام انجام نمی‌شود.`, actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString() });
    });
  };

  const statusLabel = (status: string) => ({ ACTIVE: 'فعال', PAUSED: 'متوقف', COMPLETED: 'پایان‌یافته' } as Record<string, string>)[status] || getPersianStatusLabel(status);
  const ownerName = (id: string) => state.users?.find(user => user.id === id)?.name || 'کاربر نامشخص';

  return (
    <div className="flex-1 flex min-h-0 flex-col gap-4 p-3 sm:p-5" dir="rtl">
      <div id="campaigns-toolbar" data-tour-actions><PageToolbar title="بازاریابی و مدیریت کمپین‌ها" subtitle="برنامه‌ریزی، بخش‌بندی و پیگیری اجرای کمپین"
        search={query} onSearchChange={setQuery} searchPlaceholder="جستجوی نام، مخاطب یا شناسه کمپین..." resultCount={visibleCampaigns.length}
        filters={<Select density="compact" aria-label="فیلتر وضعیت کمپین" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} ><option value="ALL">همه وضعیت‌ها</option><option value="ACTIVE">فعال</option><option value="PAUSED">متوقف</option><option value="COMPLETED">پایان‌یافته</option></Select>}
        actions={canManage ? <Button variant="primary" size="sm" onClick={() => setIsNewCampaignOpen(true)} icon={<Plus size={15} />}>کمپین جدید</Button> : undefined}
        activeFilters={statusFilter !== 'ALL' ? [{ key: 'status', label: statusLabel(statusFilter), onRemove: () => setStatusFilter('ALL') }] : []}
        onClearAll={() => { setQuery(''); setStatusFilter('ALL'); }} /></div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[{ label: 'کل کمپین‌ها', value: campaigns.length, icon: Megaphone }, { label: 'فعال', value: activeCount, icon: PlayCircle }, { label: 'متوقف', value: pausedCount, icon: PauseCircle }, { label: 'پایان‌یافته', value: completedCount, icon: CheckCircle2 }].map((metric, index) => <div key={metric.label} className="se-card animate-in p-3" style={{ animationDelay: `${index * 45}ms` }}><div className="flex items-center justify-between gap-2"><span className="se-caption">{metric.label}</span><metric.icon size={16} className="text-primary" /></div><strong className="mt-1 block text-xl font-black tabular-nums text-text-main">{metric.value.toLocaleString('fa-IR')}</strong></div>)}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,.95fr)]">
        <section id="campaigns-list" className="min-h-0 space-y-2" aria-label="فهرست کمپین‌ها">
          <div className="flex items-center justify-between gap-2 px-1"><h2 className="text-sm font-extrabold text-text-main">فهرست کمپین‌ها</h2><label className="flex items-center gap-2 text-caption text-text-secondary"><ArrowUpDown size={13} /><Select density="compact" value={sortBy} onChange={e => setSortBy(e.target.value as any)} ><option value="RECENT">جدیدترین</option><option value="OLDEST">قدیمی‌ترین</option><option value="NAME">نام کمپین</option></Select></label></div>
          <div className="space-y-2">
            {visibleCampaigns.map((campaign: Campaign, index: number) => {
              const isSelected = selectedCampaign?.id === campaign.id;
              return <button key={campaign.id} type="button" onClick={() => setSelectedId(campaign.id)} aria-pressed={isSelected} className={`se-card se-interactive animate-in flex w-full cursor-pointer items-center justify-between gap-3 p-3 text-start ${isSelected ? 'border-primary/50 bg-primary/[.045] shadow-raised' : 'hover:border-primary/25'}`} style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b className="truncate text-sm text-text-main">{campaign.name}</b><span className={`rounded-full px-2 py-0.5 text-micro font-bold ${String(campaign.status).toUpperCase() === 'ACTIVE' ? 'bg-success-soft text-success' : String(campaign.status).toUpperCase() === 'PAUSED' ? 'bg-warning-soft text-warning' : 'bg-canvas text-text-secondary'}`}>{statusLabel(campaign.status)}</span></span><span className="mt-1 block truncate text-caption text-text-secondary">{campaign.targetAudience || 'مخاطب تعریف‌نشده'} · {campaign.startDate ? formatAppDate(campaign.startDate, state.settings?.locale) : 'بدون تاریخ شروع'}</span></span>
                <ChevronLeft size={16} className={`shrink-0 ${isSelected ? 'text-primary' : 'text-text-muted'}`} />
              </button>;
            })}
            {visibleCampaigns.length === 0 && <EmptyState surface="enterprise_workspaces_2" icon={<Megaphone className="h-8 w-8 text-text-secondary opacity-50" />} title="کمپینی یافت نشد" description={campaigns.length ? 'فیلتر یا عبارت جستجو را تغییر دهید.' : 'هنوز کمپینی در داده‌های سازمان ثبت نشده است.'} actionLabel={canManage ? 'ایجاد کمپین' : undefined} onAction={canManage ? () => setIsNewCampaignOpen(true) : undefined} />}
          </div>
        </section>

        <aside id="campaigns-detail" className="min-h-0" aria-label="جزئیات کمپین انتخاب‌شده">
          {selectedCampaign ? <div key={selectedCampaign.id} className="se-card animate-in slide-in-from-bottom space-y-4 p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="se-caption">جزئیات کمپین</span><h2 className="mt-1 text-base font-black text-text-main">{selectedCampaign.name}</h2><p className="mt-1 text-xs leading-6 text-text-secondary">{selectedCampaign.description || 'توضیحی برای این کمپین ثبت نشده است.'}</p></div><span className="rounded-xl border border-border bg-canvas p-2 text-primary"><Target size={18} /></span></div>
            <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-canvas p-3"><span className="se-caption">مالک کمپین</span><strong className="mt-1 block text-text-main">{ownerName(selectedCampaign.ownerId)}</strong></div><div className="rounded-xl bg-canvas p-3"><span className="se-caption">وضعیت</span><strong className="mt-1 block text-text-main">{statusLabel(selectedCampaign.status)}</strong></div><div className="rounded-xl bg-canvas p-3"><span className="se-caption">شروع</span><strong className="mt-1 block text-text-main">{selectedCampaign.startDate ? formatAppDate(selectedCampaign.startDate, state.settings?.locale) : 'ثبت نشده'}</strong></div><div className="rounded-xl bg-canvas p-3"><span className="se-caption">پایان</span><strong className="mt-1 block text-text-main">{selectedCampaign.endDate ? formatAppDate(selectedCampaign.endDate, state.settings?.locale) : 'ثبت نشده'}</strong></div></div>
            <div className="space-y-2 rounded-xl border border-border p-3"><div className="flex items-center gap-2 text-xs font-bold text-text-main"><Filter size={14} className="text-primary" /> جامعه هدف</div><p className="text-xs text-text-secondary">{selectedCampaign.targetAudience || 'بدون تعریف مخاطب'}</p><p className="text-xs text-text-secondary">{selectedSegment ? `سگمنت متصل: ${selectedSegment.name}` : 'سگمنت پویا به این کمپین متصل نیست.'}</p>{selectedSegment && <p className="text-micro text-text-muted">وضعیت سگمنت: {selectedSegment.active ? 'فعال' : 'غیرفعال'} · نوع تطبیق: {selectedSegment.matchType || 'ANY'} · تعداد قواعد: {(selectedSegment.rules || []).length.toLocaleString('fa-IR')}</p>}</div>
            <div className="rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-text-main">سوابق ارزیابی / اجرا</span><span className="text-micro text-text-secondary">{campaignExecutions.length.toLocaleString('fa-IR')} رکورد محلی</span></div>{campaignExecutions.length ? <div className="mt-2 space-y-2">{campaignExecutions.slice(0, 5).map((execution: any) => <div key={execution.id} className="flex items-center justify-between gap-2 text-caption"><span className="truncate text-text-secondary">حساب: {state.accounts.find(a => a.id === execution.accountId)?.name || 'نامشخص'}</span><span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-warning">{execution.status === 'NOT_CONFIGURED' ? 'کانال ارسال پیکربندی نیست' : getPersianStatusLabel(execution.status)}</span></div>)}</div> : <p className="mt-2 text-caption text-text-muted">هنوز رکورد اجرایی برای این کمپین ثبت نشده است.</p>}</div>
            {canManage && <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="primary" disabled={!selectedSegmentIsUsable || pendingEvaluation} onClick={() => handleEvaluateAudience(selectedCampaign)} icon={<Target size={14} />}>{pendingEvaluation ? 'ارزیابی در صف است' : 'ارزیابی جامعه هدف'}</Button></div>}
          </div> : <div className="se-card flex min-h-56 items-center justify-center p-8 text-center text-xs text-text-secondary">برای مشاهده جزئیات، یک کمپین را انتخاب کنید.</div>}
        </aside>
      </div>

      <Modal isOpen={isNewCampaignOpen} onClose={() => setIsNewCampaignOpen(false)} title="ایجاد کمپین بازاریابی">
        {formError && <div role="alert" className="mb-3 rounded-lg bg-danger-soft p-2 text-xs font-bold text-danger">{formError}</div>}
        <DynamicFormRenderer schema={campaignFormSchema} initialValues={campaignFormInitial} onSubmit={handleCreateCampaign} onCancel={() => setIsNewCampaignOpen(false)} submitLabel="ثبت کمپین" />
      </Modal>
    </div>
  );
}

export function KnowledgeWorkspace({ state, updateState }: WorkspaceProps) {
  const { rbac, denied } = useCan(state, updateState);
  const articles = (state.articles || []).filter((article: KnowledgeArticle) => article.status === 'PUBLISHED' || (article.status === 'DRAFT' && rbac.hasPermission('knowledge.manage')));
  const [isNewArticleOpen, setIsNewArticleOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('ALL');

  useDeepLinkCreate(() => setIsNewArticleOpen(true));

  const categories: string[] = useMemo(() => Array.from(new Set<string>(articles.map((article: KnowledgeArticle) => String(article.category || 'عمومی').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fa')), [articles]);
  const visibleArticles = useMemo(() => articles.filter(article =>
    (activeCategory === 'ALL' || article.category === activeCategory) &&
    (!searchQuery.trim() || matchesSearch(`${article.title} ${article.content} ${article.category}`, searchQuery))
  ).sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')), [articles, activeCategory, searchQuery]);
  
  const [formError, setFormError] = useState('');
  const articleFormSchema = createKnowledgeArticleFormSchema();

  const handleCreateArticle = (values: Record<string, any>) => {
    if (!rbac.hasPermission('knowledge.manage')) return denied('ثبت مقاله دانش');
    if (!state.currentUserId) return;
    setFormError('');
    const title = String(values.title || '').trim();
    const category = String(values.category || 'آموزش عمومی').trim();
    const content = String(values.content || '').trim();
    if (!title || !content) return setFormError('عنوان و متن مقاله الزامی است.');

    const newArt: KnowledgeArticle = {
      id: generateId(),
      title: title.trim(),
      category: category.trim(),
      content: content.trim(),
      status: 'PUBLISHED',
      authorId: state.currentUserId,
      createdAt: new Date().toISOString()
    };

    updateState(draft => {
      if (!draft.articles) draft.articles = [];
      draft.articles.unshift(newArt);
    });

    setIsNewArticleOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-transparent" dir="rtl">
      <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 data-tour-heading className="text-lg font-extrabold text-text-main flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" /> پایگاه دانش و دستورالعمل‌ها</h2>
            <p className="text-xs text-text-secondary mt-1">مرجع جست‌وجوپذیر آیین‌نامه‌ها، رویه‌ها و آموزش‌های سازمانی</p>
          </div>
          {rbac.hasPermission('knowledge.manage') && <Button variant="primary" onClick={() => setIsNewArticleOpen(true)} icon={<Plus className="w-4 h-4" />}>مقاله جدید</Button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="rounded-2xl border border-border bg-surface px-3 py-2"><span className="block text-micro text-text-secondary">مستندات قابل مشاهده</span><strong className="mt-1 block text-lg font-black text-text-main tabular-nums">{visibleArticles.length.toLocaleString('fa-IR')}</strong></div>
          <div className="rounded-2xl border border-border bg-surface px-3 py-2"><span className="block text-micro text-text-secondary">دسته‌بندی‌ها</span><strong className="mt-1 block text-lg font-black text-text-main tabular-nums">{categories.length.toLocaleString('fa-IR')}</strong></div>
          <div className="hidden sm:block rounded-2xl border border-border bg-surface px-3 py-2"><span className="block text-micro text-text-secondary">آخرین انتشار</span><strong className="mt-1 block text-sm font-bold text-text-main">{articles[0] ? formatAppDate(articles.slice().sort((a,b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))[0].createdAt, state.settings?.locale) : '—'}</strong></div>
        </div>
        <div id="knowledge-search" className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
          <InputControl value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="جست‌وجو در عنوان، متن و دسته‌بندی مستندات…" aria-label="جست‌وجو در پایگاه دانش" />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="دسته‌بندی مستندات">
          <button role="tab" aria-selected={activeCategory === 'ALL'} onClick={() => setActiveCategory('ALL')} className={`min-h-9 shrink-0 rounded-full px-4 text-xs font-bold transition-all ${activeCategory === 'ALL' ? 'bg-primary text-white shadow-sm' : 'border border-border bg-surface text-text-secondary hover:bg-canvas'}`}>همه مستندات</button>
          {categories.map(category => <button key={category} role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)} className={`min-h-9 shrink-0 rounded-full px-4 text-xs font-bold transition-all ${activeCategory === category ? 'bg-primary text-white shadow-sm' : 'border border-border bg-surface text-text-secondary hover:bg-canvas'}`}>{category}</button>)}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-24">
        {visibleArticles.length ? (
          <div id="knowledge-grid" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleArticles.map(article => (
              <button key={article.id} onClick={() => setSelectedArticle(article)} className="group flex min-h-(--size-180) flex-col rounded-2xl border border-border bg-surface p-4 text-right shadow-subtle transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className="flex w-full items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/5 text-primary"><FileText size={18} /></span>
                  <span className="min-w-0 flex-1"><strong className="block line-clamp-2 text-sm font-extrabold text-text-main transition-colors group-hover:text-primary">{article.title}</strong><span className="mt-1 block text-micro text-text-secondary">{article.category || 'عمومی'}</span></span>
                </div>
                <span className="mt-3 line-clamp-3 flex-1 text-xs leading-6 text-text-secondary">{article.content}</span>
                <span className="mt-3 flex w-full items-center justify-between border-t border-border pt-3 text-micro text-text-secondary"><span>انتشار: {formatAppDate(article.createdAt, state.settings?.locale)}</span><span className="flex items-center gap-1 font-bold text-primary">مطالعه مستند <ChevronLeft size={13} /></span></span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState surface="enterprise_workspaces_3" icon={<BookOpen className="w-8 h-8 text-text-secondary opacity-50" />} title={articles.length ? 'مستندی با این جست‌وجو پیدا نشد' : 'پایگاه دانش هنوز محتوایی ندارد'} description={articles.length ? 'عبارت جست‌وجو یا دسته‌بندی انتخاب‌شده را تغییر دهید.' : 'آیین‌نامه‌ها و راهنماهای تأییدشده را به پایگاه دانش اضافه کنید.'} actionLabel={rbac.hasPermission('knowledge.manage') ? 'افزودن مستند' : undefined} onAction={() => setIsNewArticleOpen(true)} />
        )}
      </div>

      {selectedArticle && <Modal isOpen onClose={() => setSelectedArticle(null)} title={selectedArticle.title} size="2xl" footer={<Button size="sm" variant="primary" onClick={() => setSelectedArticle(null)}>بستن مستند</Button>}>
        <div className="space-y-4 text-xs"><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-canvas p-3"><span className="font-bold text-primary">{selectedArticle.category || 'عمومی'}</span><span className="text-text-secondary">آخرین به‌روزرسانی: {formatAppDate(selectedArticle.updatedAt || selectedArticle.createdAt, state.settings?.locale)}</span></div><article className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm leading-8 text-text-main">{selectedArticle.content}</article></div>
      </Modal>}

      <Modal isOpen={isNewArticleOpen} onClose={() => setIsNewArticleOpen(false)} title="افزودن مقاله و شیوه‌نامه جدید">
        {formError && <div role="alert" className="mb-3 p-2 bg-red-50 text-danger rounded-lg font-bold">{formError}</div>}
        <DynamicFormRenderer schema={articleFormSchema} initialValues={{ category: 'مالی و اعتبارات' }} onSubmit={handleCreateArticle} onCancel={() => setIsNewArticleOpen(false)} submitLabel="انتشار مقاله" />
      </Modal>
    </div>
  );
}
