import React, { useMemo, useState } from 'react';
import { AppState, AdvanceRequest } from '../../types';
import { useCan } from '../../hooks/useCan';
import { useTabParam } from '../../hooks/useTabParam';
import { makeCanAccess } from '../../lib/navigation';
import { Button } from '../ui/Button';
import { Input, InputControl } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageToolbar } from '../ui/PageToolbar';
import { DynamicFormRenderer } from '../shared/DynamicFormRenderer';
import { createInterviewFormSchema } from '../../services/dynamicFormEngine';
import { 
  APPLICATION_STATUS_LABEL, 
  FILE_STATUS_LABEL, 
  ApplicationStatus, 
  SMS_PROVIDER_STATUS, 
  computeMissing, 
  getOnboardingConfig, 
  prepareCredentialsSms, 
  recordInterviewResult, 
  referToInterview, 
  reviewPersonnelFile, 
  transitionApplication, 
  InterviewResult 
} from '../../lib/onboarding';
import { generateId, formatCurrency } from '../../lib/utils';
import { formatAppDate } from '../../lib/utils';
import { PayrollRepository } from '../../services/repository';
import { 
  simulatePerformanceAdjustment,
  generatePayaBankingBatchFile
} from '../../services/payrollEngine';
import { AdvanceDecisionPanel } from '../shared/AdvanceDecisionPanel';
import { ContextToggle } from '../shared/FinancialContextPanel';
import { decideAdvanceWithContext } from '../../lib/financialIntelligence';
import { withViewer } from '../../lib/financialAccess';
import { Wallet, Calculator, Sliders, CheckCircle2, AlertTriangle, ArrowUpRight, Download } from 'lucide-react';
import { FilterChip } from '../ui/Tabs';
import { getActiveDataProvider } from '../../services/dataProvider';
import { RecruitmentReviewPanel } from './RecruitmentReviewPanel';
import { LearningCatalogPanel } from './LearningCatalogPanel';

type Tab = 'apps' | 'files' | 'payroll' | 'learning' | 'config';
const TABS: readonly Tab[] = ['apps', 'files', 'payroll', 'learning', 'config'];
const maskNid = (n?: string) => (n ? n.slice(0, 3) + '****' + n.slice(-3) : '—');

export function OnboardingAdminWorkspace({ state, updateState }: { state: AppState; updateState: (u: (d: AppState) => AppState | void) => void }) {
  const { rbac, can, denied } = useCan(state, updateState);
  const me = state.currentUserId; 
  const remote=getActiveDataProvider().name==='SQLSERVER_BACKEND';
  const cfg = getOnboardingConfig(state); 
  const canManageLearning = makeCanAccess(rbac)('hr.learningCatalog');
  const visibleTabs = TABS.filter(item => item !== 'learning' || canManageLearning);
  const [tab, setTab] = useTabParam(visibleTabs, 'apps');
  const [q, setQ] = useState(''); 
  const [statusF, setStatusF] = useState<'ALL' | ApplicationStatus>('ALL'); 
  const [fileStatusF, setFileStatusF] = useState<'ALL' | 'INCOMPLETE' | 'SUBMITTED_FOR_REVIEW' | 'NEEDS_CORRECTION' | 'APPROVED'>('ALL');
  const [openApp, setOpenApp] = useState<string | null>(null); 
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [note, setNote] = useState(''); 
  const [interviewFor, setInterviewFor] = useState<string | null>(null); 
  const [msg, setMsg] = useState('');

  // شبیه‌ساز حقوق و جریمه
  const [simThreshold, setSimThreshold] = useState('90');
  const [simPenaltyMult, setSimPenaltyMult] = useState('1.5');
  const [showSimulator, setShowSimulator] = useState(false);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 6000); };
  const apps: any[] = state.onboardingApplications || []; 
  const files: any[] = state.personnelFiles || [];
  const advances: AdvanceRequest[] = state.advanceRequests || [];
  const payrollRuns = state.payrollRuns || [];

  const att = (id?: string) => (state.attachments || []).find((a: any) => a.id === id) as any; 
  const userName = (id?: string) => state.users?.find(u => u.id === id)?.name || '—';

  const visibleApps = useMemo(() => apps.filter(a => (statusF === 'ALL' || a.status === statusF) && (!q.trim() || `${a.firstName} ${a.lastName} ${a.mobile} ${a.desiredRole}`.toLocaleLowerCase('fa').includes(q.trim().toLocaleLowerCase('fa')))).sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')), [apps, q, statusF]);
  const visibleFiles = useMemo(() => files.filter(f => (fileStatusF === 'ALL' || f.status === fileStatusF) && (!q.trim() || `${userName(f.userId)} ${f.userId}`.toLocaleLowerCase('fa').includes(q.trim().toLocaleLowerCase('fa')))).sort((a, b) => Date.parse(b.updatedAt || b.createdAt || '') - Date.parse(a.updatedAt || a.createdAt || '')), [files, q, fileStatusF, state.users]);
  
  const app = apps.find(a => a.id === openApp); 
  const file = files.find(f => f.userId === openFile);

  const act = (need: 'EDIT' | 'APPROVE', what: string, fn: (d: AppState) => { ok: boolean; reason?: string; errors?: string[] }) => {
    if (!can('onboarding', need)) return denied(what);
    let r: any = { ok: false }; 
    updateState(d => { r = fn(d); }); 
    if (!r.ok) flash(r.reason || (r.errors || []).join(' ') || 'انجام نشد.'); 
    else { setNote(''); flash(remote ? 'تغییر در صف همگام‌سازی قرار گرفت.' : 'عملیات با موفقیت انجام شد.'); }
    return r;
  };

  const interviewers = (state.users || []).filter(u => (u.isActive ?? (u as any).active) !== false).map(u => ({ id: u.id, name: u.name }));

  // اجرای محاسبه دوره حقوق
  const handleExecutePayroll = async () => {
    if (!can('onboarding', 'APPROVE')) return denied('محاسبه و اجرای دوره حقوق');
    const period = new Date().toISOString().slice(0, 7);
    // دسترسی فقط از مسیر Provider (قانون اساسی §D)؛ محاسبه، ثبت فیش و تسویه مساعده داخل Provider انجام می‌شود.
    try {
      const run = await PayrollRepository.runPayroll(period, 30);
      const eligible = (state.users || []).filter(u => (u.isActive ?? (u as any).active) !== false).length;
      const skipped = Math.max(0, eligible - run.totalEmployees);
      flash(`حقوق دوره ${period} برای ${run.totalEmployees.toLocaleString('fa-IR')} نفر محاسبه و ثبت شد.` + (skipped ? ` ${skipped.toLocaleString('fa-IR')} نفر بدون حقوق ثبت‌شده کنار ماندند.` : ''));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      flash(msg.startsWith('PAYROLL_NO_ELIGIBLE_EMPLOYEES') ? 'هیچ کاربری حقوق ثبت‌شده ندارد؛ ابتدا اصول حقوق را تعریف کنید.' : 'اجرای حقوق ناموفق بود: ' + msg);
    }
  };


  // تأیید مساعده
  const handleDecideAdvance = (advanceId: string, decision: 'APPROVED' | 'REJECTED', note = '') => {
    if (!can('onboarding', 'APPROVE')) return denied('تصمیم‌گیری روی درخواست مساعده');
    let result: { ok: boolean; reason?: string } = { ok: false };
    updateState(draft => { result = decideAdvanceWithContext(draft, advanceId, { decision, note, actorId: me }, new Date(), withViewer(draft)); });
    flash(result.ok ? `درخواست مساعده ${decision === 'APPROVED' ? 'تأیید شد و در فیش ماه جاری اعمال خواهد شد (پرداخت قطعی نیست)' : 'رد شد'}.` : (result.reason || 'تصمیم ثبت نشد.'));
  };

  // شبیه‌ساز آزمایشی
  const simResult = useMemo(() => {
    // انطباق: آخرین ارزیابی واقعی (غیرشبیه‌سازی) هر کاربر؛ نرخ جریمهٔ پایه هنوز منبع تنظیم ندارد ⇒ null (بدون عدد حدسی).
    const complianceByUserId: Record<string, number> = {};
    [...(state.performanceAssessments || [])]
      .filter(a => !a.isSimulated && Number.isFinite(a.totalScore))
      .sort((a, b) => String(a.periodMonth).localeCompare(String(b.periodMonth)))
      .forEach(a => { complianceByUserId[a.userId] = a.totalScore; });
    return simulatePerformanceAdjustment({
      basePenaltyRatePercent: null,
      complianceByUserId,
      users: state.users || [],
      salaryProfiles: state.salaryProfiles || [],
      currentThresholdPercent: 80,
      newThresholdPercent: Number(simThreshold) || 90,
      penaltyMultiplier: Number(simPenaltyMult) || 1.5
    });
  }, [state.users, state.salaryProfiles, state.performanceAssessments, simThreshold, simPenaltyMult]);

  if (!can('onboarding', 'VIEW')) return <div className="p-6 text-sm text-text-secondary">دسترسی به این بخش برای شما مجاز نیست.</div>;

  return (
    <div className="space-y-3.5 p-3 sm:p-4 pb-24 font-sans" dir="rtl">
      <div id="onboarding-tabs" data-tour-actions><PageToolbar 
        title="منابع انسانی، جذب و امور حقوقی" 
        subtitle="درخواست همکاری، پرونده پرسنلی، صدور فیش دوره و مدیریت مساعده" 
        search={tab === 'apps' || tab === 'files' ? q : undefined}
        onSearchChange={tab === 'apps' || tab === 'files' ? setQ : undefined}
        searchPlaceholder="جستجو در نام، کد یا عنوان..."
        filters={
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {visibleTabs.map(t => (
              <FilterChip active={tab === t} key={t} onClick={() => setTab(t)} >
                {t === 'apps' ? (remote ? 'درخواست‌های همکاری' : `درخواست‌های همکاری (${apps.length})`) :
                 t === 'files' ? `پرونده‌های پرسنلی (${files.length})` :
                 t === 'payroll' ? 'حقوق، مساعده و پورسانت' : t === 'learning' ? 'آموزش و آزمون' : 'تنظیمات'}
              </FilterChip>
            ))}
          </div>
        }
      /></div>

      {msg && <p role="status" className="rounded-xl bg-primary/10 p-2.5 text-xs font-bold text-primary">{msg}</p>}
      <p className="rounded-xl border border-border bg-surface px-3 py-2 text-caption leading-5 text-text-secondary">تأیید مدارک، وضعیت استخدام و فعال‌سازی حساب سه مفهوم جدا هستند؛ تأیید پرونده به‌تنهایی حساب کاربری را فعال یا وضعیت استخدام را قطعی نمی‌کند.</p>

      {tab==='apps' && remote && <div id="onboarding-content" data-tour-primary>
        <RecruitmentReviewPanel key={me} search={q} viewer={me || ''} canEdit={can('onboarding','EDIT')} attachments={state.attachments ?? []}/>
      </div>}
      {tab === 'learning' && (remote && me ? <LearningCatalogPanel key={me} viewer={me} /> : (
        <p role="status" className="rounded-xl border border-border bg-surface p-3 text-sm text-text-secondary">مدیریت دوره‌ها پس از اتصال به سرور در دسترس است.</p>
      ))}
      {tab === 'apps' && !remote && (
        <div id="onboarding-content" data-tour-primary className="space-y-2">
          {visibleApps.map(a => (
            <div 
              key={a.id} 
              onClick={() => setOpenApp(a.id)} 
              className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div>
                <b className="text-xs font-bold text-text-main block">{a.firstName} {a.lastName}</b>
                <span className="text-mini text-text-secondary mt-0.5 block">{a.desiredRole} · {a.mobile}</span>
              </div>
              <span className="px-2 py-0.5 text-micro font-bold rounded-md bg-canvas border border-border text-text-secondary">
                {APPLICATION_STATUS_LABEL[a.status as ApplicationStatus]}
              </span>
            </div>
          ))}
          {visibleApps.length === 0 && <p className="text-center py-8 text-xs text-text-secondary">درخواستی یافت نشد.</p>}
        </div>
      )}

      {tab === 'files' && (
        <div className="space-y-2">
          {visibleFiles.map(f => (
            <div 
              key={f.userId} 
              onClick={() => setOpenFile(f.userId)} 
              className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div>
                <b className="text-xs font-bold text-text-main block">{userName(f.userId)}</b>
                <span className="text-mini text-text-secondary mt-0.5 block">
                  {computeMissing(f, cfg).length > 0 ? `${computeMissing(f, cfg).length} مورد نیازمند تکمیل` : 'تکمیل‌شده'}
                </span>
              </div>
              <span className="px-2 py-0.5 text-micro font-bold rounded-md bg-primary/10 text-primary">
                {FILE_STATUS_LABEL[f.status as keyof typeof FILE_STATUS_LABEL]}
              </span>
            </div>
          ))}
          {visibleFiles.length === 0 && <p className="text-center py-8 text-xs text-text-secondary">پرونده‌ای یافت نشد.</p>}
        </div>
      )}

      {tab === 'payroll' && (
        <div className="space-y-3.5 text-xs">
          {/* نوار بالایی محاسبه حقوق و شبیه‌ساز */}
          <div className="flex flex-wrap justify-between items-center gap-2 p-3 bg-surface border border-border rounded-xl">
            <div>
              <span className="text-xs font-bold text-text-main block">موتور محاسبه حقوق و دستمزد ماه جاری</span>
              <span className="text-mini text-text-secondary">مبنای استاندارد ۳۰ روزه با اعمال اضافه‌کاری، پورسانت و کسر مساعده</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowSimulator(v => !v)} icon={<Sliders size={13} />}>
                شبیه‌ساز اثر قوانین
              </Button>
              <Button size="sm" variant="primary" onClick={handleExecutePayroll} icon={<Calculator size={13} />}>
                اجرا و صدور فیش‌های دوره
              </Button>

              {payrollRuns.length > 0 && (
                <Button size="sm" variant="success" onClick={() => {
                  const { fileContent, fileName } = generatePayaBankingBatchFile(
                    state.payslips || [], state.users || [], state.personnelFiles || [], cfg.tenantName
                  );
                  const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url; link.download = fileName;
                  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
                }} icon={<Download size={13} />}>خروجی فایل بانک (پایا)</Button>
              )}
            </div>
          </div>

          {/* شبیه‌ساز حقوق و عملکرد */}
          {showSimulator && (
            <div className="p-3.5 bg-canvas border border-primary/25 rounded-xl space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Sliders size={14} />
                <span>شبیه‌ساز آزمایشی قوانین (بدون اثر مالی بر دفاتر واقعی)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-caption font-semibold text-text-secondary mb-1">حدنصاب جدید ارزیابی (درصد):</label>
                  <InputControl 
                    type="number" 
                    value={simThreshold} 
                    onChange={e => setSimThreshold(e.target.value)} 
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="block text-caption font-semibold text-text-secondary mb-1">ضریب کسورات پیشنهادی:</label>
                  <InputControl 
                    type="number" 
                    step="0.1" 
                    value={simPenaltyMult} 
                    onChange={e => setSimPenaltyMult(e.target.value)} 
                    className="font-mono"
                  />
                </div>
              </div>

              {simResult.unavailableReason ? (
                <div className="p-2.5 bg-surface rounded-lg border border-border text-xs text-text-secondary">نرخ پایهٔ جریمه در تنظیمات سازمان ثبت نشده است؛ شبیه‌سازی بدون عدد حدسی ممکن نیست.</div>
              ) : (
              <div className="p-2.5 bg-surface rounded-lg border border-border flex justify-between items-center text-xs">
                <span>تعداد پرسنل مشمول: <b className="text-danger font-mono">{simResult.simulatedAffectedCount} نفر</b> (تغییر نسبت به وضع فعلی: {simResult.simulatedAffectedCount - simResult.currentAffectedCount})</span>
                <span>اثر ریالی تجمیعی: <b className="text-text-main font-mono">{formatCurrency(simResult.totalFinancialDeltaRials)} ریال</b></span>
              </div>
              )}
            </div>
          )}

          {/* کارتابل بررسی و تایید مساعده‌ها */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-text-main">درخواست‌های مساعده مالی پرسنل ({advances.length})</h4>
            {advances.map(a => (
              <div key={a.id} className="p-3 bg-surface border border-border rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-bold text-text-main">{userName(a.userId)}</strong>
                    <span className="font-mono text-primary font-bold">{formatCurrency(a.requestedAmountRials)} ریال</span>
                    <span className={`px-1.5 py-0.2 rounded text-tiny font-bold ${
                      a.status === 'APPROVED' ? 'bg-success-soft text-success' :
                      a.status === 'REJECTED' ? 'bg-danger-soft text-danger' :
                      a.status === 'SETTLED' ? 'bg-canvas text-text-secondary' : 'bg-warning-soft text-warning'
                    }`}>
                      {a.status === 'APPROVED' ? 'تأییدشده' : a.status === 'REJECTED' ? 'ردشده' : a.status === 'SETTLED' ? 'تسویه‌شده در فیش' : 'در انتظار بررسی'}
                    </span>
                  </div>
                  <span className="text-mini text-text-secondary mt-0.5 block">{a.reason}</span>
                </div>

                {a.status === 'REQUESTED' && can('onboarding', 'APPROVE') && (
                  <ContextToggle label="بررسی سابقه و تصمیم" className="w-full sm:w-auto self-end sm:self-auto">
                    <AdvanceDecisionPanel advance={a} state={state} updateState={updateState} actorId={me} onResult={(m) => flash(m)} />
                  </ContextToggle>
                )}
              </div>
            ))}
            {advances.length === 0 && <p className="text-center py-4 text-xs text-text-secondary">درخواست مساعده بازی وجود ندارد.</p>}
          </div>

          {/* تاریخچه اجرای دوره‌های حقوق */}
          {payrollRuns.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <h4 className="text-xs font-bold text-text-main">سوابق دوره‌های محاسبه‌شده حقوق:</h4>
              {payrollRuns.map(run => (
                <div key={run.id} className="p-2.5 bg-surface border border-border rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <strong className="block text-text-main font-mono">دوره {run.periodMonth}</strong>
                    <span className="text-micro text-text-secondary mt-0.5 block">{run.totalEmployees} پرسنل</span>
                  </div>
                  <div className="text-left font-mono">
                    <span className="font-bold text-primary block">{formatCurrency(run.totalNetRials)} ریال</span>
                    <span className="text-tiny text-text-secondary">خالص پرداختی کل</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* جزئیات درخواست همکاری */}
      <Modal isOpen={!!app} onClose={() => setOpenApp(null)} title={app ? `${app.firstName} ${app.lastName}` : ''}>
        {app && (
          <div className="space-y-3 text-xs">
            <dl className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-2.5">
              <dt className="font-bold">وضعیت</dt><dd>{APPLICATION_STATUS_LABEL[app.status as ApplicationStatus]}</dd>
              <dt className="font-bold">شغل درخواستی</dt><dd>{app.desiredRole}</dd>
              <dt className="font-bold">موبایل</dt><dd dir="ltr" className="text-start">{app.mobile}</dd>
              <dt className="font-bold">کد ملی</dt><dd dir="ltr" className="text-start">{maskNid(app.nationalId)}</dd>
            </dl>
          </div>
        )}
      </Modal>

      {/* جزئیات پرونده پرسنلی */}
      <Modal isOpen={!!file} onClose={() => setOpenFile(null)} title={file ? `پرونده پرسنلی: ${userName(file.userId)}` : ''}>
        {file && (
          <div className="space-y-3 text-xs">
            <p>وضعیت مدارک: <b className="text-primary">{FILE_STATUS_LABEL[file.status as keyof typeof FILE_STATUS_LABEL]}</b></p>
            {file.status === 'SUBMITTED_FOR_REVIEW' && (
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="primary" onClick={() => act('APPROVE', 'تأیید مدارک', d => reviewPersonnelFile(d, file.userId, 'APPROVE', note, me, new Date()))}>تأیید مدارک</Button>
                <Button size="sm" variant="outline" onClick={() => act('APPROVE', 'بازگشت برای اصلاح', d => reviewPersonnelFile(d, file.userId, 'NEEDS_CORRECTION', note, me, new Date()))}>نیازمند اصلاح</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
