import React, { useMemo, useState } from 'react';
import { BadgeCheck, Plus, Save, X, Pencil, CheckCircle2 } from 'lucide-react';
import type { AppState, CommissionPlan, CommissionTier, SalesTarget } from '../types';
import { Button } from './ui/Button';
import { InputControl, Select } from './ui/Input';
import { generateSecureId } from '../lib/secureId';
import { formatNumber } from '../lib/format';
import { toLatinDigits } from '../lib/digits';

type View = 'targets' | 'commissions';
type Scope = 'COMPANY' | 'USER';
interface Props {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  initialView: View;
  canEdit: boolean;
  canApprove: boolean;
}
const currentMonth = () => new Date().toISOString().slice(0, 7);
const parseAmount = (value: string): number | null => {
  const latin = toLatinDigits(value).replace(/[٬,\s]/g, '');
  if (!/^\d+$/.test(latin)) return null;
  const amount = Number(latin);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
};
const targetStatus = (value?: string) => value === 'APPROVED' ? 'مصوب' : value === 'REJECTED' ? 'ردشده' : 'پیش‌نویس';
const tiersToText = (tiers: CommissionTier[]) => tiers.map(t => `${t.minAchievementPercent}|${t.maxAchievementPercent ?? ''}|${t.commissionRatePercent}`).join('\n');
function parseTiers(raw: string): CommissionTier[] | null {
  const rows = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!rows.length) return null;
  const tiers: CommissionTier[] = [];
  for (const row of rows) {
    const parts = row.split(/[|,]/).map(x => x.trim());
    if (parts.length !== 3) return null;
    const min = Number(toLatinDigits(parts[0]));
    const max = parts[1] === '' ? undefined : Number(toLatinDigits(parts[1]));
    const rate = Number(toLatinDigits(parts[2]));
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100
      || (max !== undefined && (!Number.isFinite(max) || max <= min))) return null;
    tiers.push({ minAchievementPercent: min, ...(max === undefined ? {} : { maxAchievementPercent: max }), commissionRatePercent: rate });
  }
  tiers.sort((a,b) => a.minAchievementPercent-b.minAchievementPercent);
  for (let i=1;i<tiers.length;i++) {
    const previousMax = tiers[i-1].maxAchievementPercent;
    if (previousMax === undefined || tiers[i].minAchievementPercent <= previousMax) return null;
  }
  return tiers;
}
const scopeLabel = (scope?: string) => scope === 'COMPANY' ? 'سازمانی' : 'فروشنده';

export function SalesTargetsCommissionsPanel({ state, updateState, initialView, canEdit, canApprove }: Props) {
  const [view, setView] = useState<View>(initialView);
  const [targetFormOpen, setTargetFormOpen] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [targetScope, setTargetScope] = useState<Scope>('USER');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetMonth, setTargetMonth] = useState(currentMonth());
  const [targetRials, setTargetRials] = useState('');
  const [targetUnits, setTargetUnits] = useState('');
  const [targetError, setTargetError] = useState('');
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [planScope, setPlanScope] = useState<Scope>('COMPANY');
  const [planUserId, setPlanUserId] = useState('');
  const [planMultiplier, setPlanMultiplier] = useState('1');
  const [planTiers, setPlanTiers] = useState('80|99.99|1.5\n100|119.99|2.5\n120||3.5');
  const [planError, setPlanError] = useState('');

  const targets = useMemo(() => (state.salesTargets || []).filter(t => !t.deletedAt && !t.isDeleted)
    .slice().sort((a,b) => String(b.periodMonth).localeCompare(String(a.periodMonth))), [state.salesTargets]);
  const plans = useMemo(() => (state.commissionPlans || []).filter(p => !p.deletedAt && !p.isDeleted)
    .slice().sort((a,b) => Number(b.version || 1)-Number(a.version || 1)), [state.commissionPlans]);
  const users = (state.users || []).filter(user => (user.isActive ?? user.active) !== false)
    .slice().sort((a,b) => a.name.localeCompare(b.name, 'fa'));
  const userName = (id?: string) => users.find(user => user.id === id)?.name || 'فروشنده نامشخص';

  const resetTarget = () => {
    setTargetFormOpen(false); setEditingTargetId(null); setTargetScope('USER'); setTargetUserId('');
    setTargetMonth(currentMonth()); setTargetRials(''); setTargetUnits(''); setTargetError('');
  };
  const openTarget = (row?: SalesTarget) => {
    setEditingTargetId(row?.id || null);
    setTargetScope(row?.scopeType === 'COMPANY' ? 'COMPANY' : 'USER');
    setTargetUserId(row?.userId || row?.scopeId || '');
    setTargetMonth(row?.periodMonth || currentMonth());
    setTargetRials(row ? String(row.revenueTargetRials) : '');
    setTargetUnits(row?.volumeTargetUnits == null ? '' : String(row.volumeTargetUnits));
    setTargetError(''); setTargetFormOpen(true);
  };
  const saveTarget = () => {
    if (!canEdit) return;
    const amount = parseAmount(targetRials);
    const volume = targetUnits.trim() ? parseAmount(targetUnits) : null;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth) || amount === null || amount <= 0
      || (targetUnits.trim() && (volume === null || volume <= 0))
      || (targetScope === 'USER' && !users.some(user => user.id === targetUserId))) {
      setTargetError('دوره، مبلغ هدف و فروشنده را با مقدار معتبر تکمیل کنید.'); return;
    }
    const duplicate = targets.some(row => row.id !== editingTargetId
      && row.periodMonth === targetMonth && (row.scopeType === 'COMPANY' ? targetScope === 'COMPANY'
        : targetScope === 'USER' && row.userId === targetUserId)
      && (row.kpiCode || 'NET_SALES_IRR') === 'NET_SALES_IRR'
      && !row.productBrand && !row.territoryId);
    if (duplicate) { setTargetError('برای این فروشنده و دوره هدف فروش مشابهی وجود دارد؛ رکورد موجود را ویرایش کنید.'); return; }
    const now = new Date().toISOString();
    updateState(draft => {
      const current = (draft.salesTargets || []) as SalesTarget[];
      const existing = current.find(row => row.id === editingTargetId);
      const next: SalesTarget = {
        ...(existing || {} as SalesTarget),
        id: editingTargetId || generateSecureId('sales-target'),
        ...(targetScope === 'USER' ? { userId: targetUserId, scopeId: targetUserId } : { userId: undefined, scopeId: undefined }),
        scopeType: targetScope,
        periodMonth: targetMonth,
        revenueTargetRials: amount,
        ...(volume === null ? {} : { volumeTargetUnits: volume }),
        kpiCode: 'NET_SALES_IRR',
        approvalStatus: 'DRAFT',
        approvedBy: undefined,
        approvedAt: undefined,
        createdBy: existing?.createdBy || draft.currentUserId || undefined,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      draft.salesTargets = existing ? current.map(row => row.id === existing.id ? next : row) : [next, ...current];
      draft.auditLogs ||= [];
      draft.auditLogs.push({ id: generateSecureId('audit-target'), action: existing ? 'SALES_TARGET_UPDATED' : 'SALES_TARGET_CREATED',
        entityType: 'SALES_TARGET', entityId: next.id, actor: draft.currentUserId || 'unknown', createdAt: now,
        details: `هدف فروش ${targetMonth} ذخیره شد؛ وضعیت پیش‌نویس و خارج از گزارش مصوب.` });
    });
    resetTarget();
  };
  const approveTarget = (id: string) => {
    if (!canApprove || !state.currentUserId) return;
    const now = new Date().toISOString();
    updateState(draft => {
      const row = (draft.salesTargets || []).find(item => item.id === id);
      if (!row || row.approvalStatus === 'APPROVED') return;
      row.approvalStatus = 'APPROVED'; row.approvedBy = draft.currentUserId; row.approvedAt = now; row.updatedAt = now;
      draft.auditLogs ||= [];
      draft.auditLogs.push({ id: generateSecureId('audit-target'), action: 'SALES_TARGET_APPROVED',
        entityType: 'SALES_TARGET', entityId: id, actor: draft.currentUserId, createdAt: now,
        details: `هدف فروش ${row.periodMonth} تصویب شد.` });
    });
  };
  const resetPlan = () => {
    setPlanFormOpen(false); setEditingPlanId(null); setPlanName(''); setPlanScope('COMPANY'); setPlanUserId('');
    setPlanMultiplier('1'); setPlanTiers('80|99.99|1.5\n100|119.99|2.5\n120||3.5'); setPlanError('');
  };
  const openPlan = (row?: CommissionPlan) => {
    setEditingPlanId(row?.id || null); setPlanName(row?.name || '');
    setPlanScope(row?.scopeType === 'USER' ? 'USER' : 'COMPANY');
    setPlanUserId(row?.scopeId || row?.userIds?.[0] || '');
    setPlanMultiplier(String(row?.routeDifficultyMultiplier ?? 1));
    setPlanTiers(row ? tiersToText(row.tiers || []) : '80|99.99|1.5\n100|119.99|2.5\n120||3.5');
    setPlanError(''); setPlanFormOpen(true);
  };
  const savePlan = () => {
    if (!canEdit) return;
    const tiers = parseTiers(planTiers);
    const multiplier = Number(toLatinDigits(planMultiplier));
    if (!planName.trim() || !tiers || !Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 5
      || (planScope === 'USER' && !users.some(user => user.id === planUserId))) {
      setPlanError('نام طرح، پلکان‌های بدون هم‌پوشانی، ضریب مسیر و محدوده طرح را بررسی کنید.'); return;
    }
    const now = new Date().toISOString();
    updateState(draft => {
      const current = (draft.commissionPlans || []) as CommissionPlan[];
      const existing = current.find(row => row.id === editingPlanId);
      const next: CommissionPlan = {
        ...(existing || {} as CommissionPlan),
        id: editingPlanId || generateSecureId('commission-plan'),
        name: planName.trim(), tiers, routeDifficultyMultiplier: multiplier,
        scopeType: planScope, scopeId: planScope === 'USER' ? planUserId : undefined,
        userIds: planScope === 'USER' ? [planUserId] : undefined,
        isActive: true, version: Number(existing?.version || 0) + 1,
        createdBy: existing?.createdBy || draft.currentUserId || undefined, updatedAt: now,
      };
      draft.commissionPlans = existing ? current.map(row => row.id === existing.id ? next : row) : [next, ...current];
      draft.auditLogs ||= [];
      draft.auditLogs.push({ id: generateSecureId('audit-commission'), action: existing ? 'COMMISSION_PLAN_UPDATED' : 'COMMISSION_PLAN_CREATED',
        entityType: 'COMMISSION_PLAN', entityId: next.id, actor: draft.currentUserId || 'unknown', createdAt: now,
        details: `طرح پورسانت «${next.name}» نسخه ${next.version} ذخیره شد.` });
    });
    resetPlan();
  };

  return (
    <section className="space-y-3" dir="rtl" aria-label="اهداف فروش و پورسانت">
      <div className="flex items-center gap-1 rounded-xl border border-border bg-canvas p-1">
        <button type="button" onClick={() => { setView('targets'); resetPlan(); }} className={`min-h-10 flex-1 rounded-lg px-2 text-caption font-bold ${view === 'targets' ? 'bg-surface text-primary shadow-xs' : 'text-text-secondary'}`}>اهداف فروش</button>
        <button type="button" onClick={() => { setView('commissions'); resetTarget(); }} className={`min-h-10 flex-1 rounded-lg px-2 text-caption font-bold ${view === 'commissions' ? 'bg-surface text-primary shadow-xs' : 'text-text-secondary'}`}>طرح‌های پورسانت</button>
      </div>

      {view === 'targets' ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-text-main">اهداف فروشندگان</h3><p className="text-micro text-text-secondary">هدف فقط پس از تصویب در گزارش تحقق لحاظ می‌شود.</p></div>{canEdit && <Button size="sm" onClick={() => openTarget()}><Plus size={14}/>هدف جدید</Button>}</div>
          {targetFormOpen && <div className="rounded-xl border border-primary/20 bg-canvas p-3 space-y-2">
            <div className="flex items-center justify-between"><b className="text-caption">{editingTargetId ? 'ویرایش هدف' : 'تعریف هدف فروش'}</b><button type="button" aria-label="بستن فرم" onClick={resetTarget} className="grid size-8 place-items-center rounded-lg hover:bg-sunken"><X size={15}/></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Select aria-label="دامنه هدف" value={targetScope} onChange={e => setTargetScope(e.target.value as Scope)}><option value="USER">فروشنده</option><option value="COMPANY">کل سازمان</option></Select>
              {targetScope === 'USER' && <Select aria-label="فروشنده هدف" value={targetUserId} onChange={e => setTargetUserId(e.target.value)}><option value="">انتخاب فروشنده</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select>}
              <InputControl type="month" aria-label="ماه هدف" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} />
              <InputControl inputMode="numeric" aria-label="هدف فروش خالص به ریال" placeholder="هدف فروش خالص (ریال)" value={targetRials} onChange={e => setTargetRials(e.target.value)} />
              <InputControl inputMode="numeric" aria-label="هدف تعداد واحد پایه" placeholder="هدف تعداد (اختیاری)" value={targetUnits} onChange={e => setTargetUnits(e.target.value)} />
            </div>
            <p className="text-micro text-text-secondary">واحد مبلغ ریال است. برای فروشنده، هدف ماهانهٔ فروش خالص ثبت می‌شود؛ هدف سازمانی در گزارش کل جداگانه محاسبه می‌شود.</p>
            {targetError && <p role="alert" className="text-micro text-danger">{targetError}</p>}
            <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={resetTarget}>انصراف</Button><Button size="sm" onClick={saveTarget}><Save size={13}/>ذخیره پیش‌نویس</Button></div>
          </div>}
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {targets.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <div className="min-w-0"><b className="block text-caption text-text-main">{row.scopeType === 'COMPANY' ? 'هدف سازمانی' : userName(row.userId)} · {row.periodMonth}</b><span className="text-micro text-text-secondary">{formatNumber(row.revenueTargetRials)} ریال · {row.volumeTargetUnits == null ? 'هدف تعدادی ثبت نشده' : `${formatNumber(row.volumeTargetUnits)} واحد`} · {targetStatus(row.approvalStatus)}</span></div>
              <div className="flex items-center gap-1">{canEdit && <Button size="xs" variant="ghost" onClick={() => openTarget(row)}><Pencil size={13}/>ویرایش</Button>}{canApprove && row.approvalStatus !== 'APPROVED' && <Button size="xs" variant="soft" onClick={() => approveTarget(row.id)}><CheckCircle2 size={13}/>تصویب</Button>}</div>
            </div>)}
            {targets.length === 0 && <p className="p-4 text-center text-caption text-text-secondary">هدفی ثبت نشده است.</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-text-main">طرح‌های پورسانت</h3><p className="text-micro text-text-secondary">پلکان تحقق، نرخ پورسانت و ضریب مسیر؛ نسخه‌ها در سابقه حفظ می‌شوند.</p></div>{canEdit && <Button size="sm" onClick={() => openPlan()}><Plus size={14}/>طرح جدید</Button>}</div>
          {planFormOpen && <div className="rounded-xl border border-primary/20 bg-canvas p-3 space-y-2">
            <div className="flex items-center justify-between"><b className="text-caption">{editingPlanId ? 'ویرایش طرح' : 'تعریف طرح پورسانت'}</b><button type="button" aria-label="بستن فرم" onClick={resetPlan} className="grid size-8 place-items-center rounded-lg hover:bg-sunken"><X size={15}/></button></div>
            <InputControl aria-label="نام طرح پورسانت" placeholder="نام طرح" value={planName} onChange={e => setPlanName(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Select aria-label="دامنه طرح" value={planScope} onChange={e => setPlanScope(e.target.value as Scope)}><option value="COMPANY">سازمانی</option><option value="USER">فروشنده مشخص</option></Select>
              {planScope === 'USER' && <Select aria-label="فروشنده طرح" value={planUserId} onChange={e => setPlanUserId(e.target.value)}><option value="">انتخاب فروشنده</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select>}
              <InputControl inputMode="decimal" aria-label="ضریب سختی مسیر" placeholder="ضریب مسیر" value={planMultiplier} onChange={e => setPlanMultiplier(e.target.value)} />
            </div>
            <label className="block text-micro font-bold text-text-secondary">پلکان‌ها: حداقل تحقق | حداکثر تحقق (خالی = بدون سقف) | نرخ پورسانت٪</label>
            <textarea value={planTiers} onChange={e => setPlanTiers(e.target.value)} rows={4} dir="ltr" aria-label="پلکان‌های پورسانت" className="w-full rounded-xl border border-border bg-surface p-2 text-xs font-mono outline-none focus:border-primary"/>
            <p className="text-micro text-text-secondary">هر خط یک پله است؛ نمونه: 80|99.99|1.5. بازه‌های هم‌پوشان یا نرخ بیش از ۱۰۰٪ پذیرفته نمی‌شود.</p>
            {planError && <p role="alert" className="text-micro text-danger">{planError}</p>}
            <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={resetPlan}>انصراف</Button><Button size="sm" onClick={savePlan}><Save size={13}/>ذخیره نسخه جدید</Button></div>
          </div>}
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {plans.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <div className="min-w-0"><b className="block text-caption text-text-main">{row.name} <span className="text-micro text-text-secondary">· v{row.version || 1}</span></b><span className="text-micro text-text-secondary">{scopeLabel(row.scopeType)} · {row.isActive ? 'فعال' : 'غیرفعال'} · {row.tiers?.length || 0} پله · ضریب مسیر {row.routeDifficultyMultiplier}</span></div>
              {canEdit && <Button size="xs" variant="ghost" onClick={() => openPlan(row)}><Pencil size={13}/>ویرایش</Button>}
            </div>)}
            {plans.length === 0 && <p className="p-4 text-center text-caption text-text-secondary">طرح پورسانت تعریف نشده است.</p>}
          </div>
        </div>
      )}
      <p className="text-micro text-text-secondary">ذخیره این تعاریف در مجموعه‌های SQL-backed انجام می‌شود؛ هیچ هدف یا پورسانتی بدون فروش خالص تطبیق‌شده به‌عنوان قطعی گزارش نمی‌شود.</p>
    </section>
  );
}
