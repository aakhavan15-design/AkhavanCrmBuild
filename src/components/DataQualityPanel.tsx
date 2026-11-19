import React, { useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, SearchCheck } from 'lucide-react';
import type { AppState } from '../types';
import { Card } from './ui/Card';
import { useCan } from '../hooks/useCan';
import { useDataQuery } from '../hooks/useDataProvider';
import { buildQualityAuditInput } from '../lib/dataQualityInput';
import { auditErpDataQuality, QUALITY_RULE_LABELS, type QualityDomain, type QualitySeverity } from '../lib/erpDataQuality';

const fa = (n: number) => n.toLocaleString('fa-IR');
const DOMAINS: Array<{ key: QualityDomain | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'همه' }, { key: 'CUSTOMER', label: 'مشتریان' }, { key: 'ROUTE', label: 'مسیر مشتری' },
  { key: 'PRODUCT', label: 'کالا' }, { key: 'COA', label: 'کدینگ حسابداری' }, { key: 'JOURNAL', label: 'اسناد حسابداری' },
];
const SEV: Record<QualitySeverity, { label: string; cls: string }> = {
  HIGH: { label: 'بالا', cls: 'bg-danger/10 text-danger' }, MEDIUM: { label: 'متوسط', cls: 'bg-warning/10 text-warning' }, LOW: { label: 'کم', cls: 'bg-canvas text-text-secondary' },
};
const PAGE = 25;

/** نمای «کنترل کیفیت داده ERP»: خروجی موتور یگانهٔ `auditErpDataQuality` (بدون هیچ عدد نمونه). */
export function DataQualityPanel({ state }: { state: AppState }) {
  const [domain, setDomain] = useState<QualityDomain | 'ALL'>('ALL');
  const [rule, setRule] = useState<string>('ALL');
  const [limit, setLimit] = useState(PAGE);
  const { can } = useCan(state);
  const canFinance = can('finance', 'VIEW'), canAccounts = can('accounts', 'VIEW');
  // منبع داده: DataProvider (نه state مستقیم). حوزهٔ دید: بدون مجوز مالی/مشتری یا با مجموعهٔ پنهان‌شده توسط Provider، آن حوزه وارد ممیزی نمی‌شود (UI guard جایگزین RLS سرور نیست).
  const refreshKey = `${state.accounts?.length ?? 0}:${state.journalLines?.length ?? 0}:${state.coaMirror?.length ?? 0}:${state.geoZones?.length ?? 0}`;
  const { data: snapshot, loading, error, refetch } = useDataQuery(provider => provider.getStateSnapshot(), [refreshKey]);
  const result = useMemo(() => auditErpDataQuality(buildQualityAuditInput(snapshot, { canFinance, canAccounts }).input), [snapshot, canFinance, canAccounts]);

  const visible = result.issues.filter(i => (domain === 'ALL' || i.domain === domain) && (rule === 'ALL' || i.ruleCode === rule));
  const rules = Object.entries(result.byRule).filter(([code]) => domain === 'ALL' || result.issues.find(i => i.ruleCode === code)?.domain === domain);
  const total = Object.values(result.byRule).reduce((a, b) => a + b, 0);

  return <Card padding="lg" className="space-y-3" aria-labelledby="dq-heading">
    <div>
      <h2 id="dq-heading" className="flex items-center gap-2 text-sm font-black"><SearchCheck size={16} className="text-primary" /> کنترل کیفیت داده ERP</h2>
      <p className="mt-1 text-xs leading-6 text-text-secondary">اشتباهات احتمالی داده‌های دریافتی از ERP: مشتری تکراری، کد ملی/موبایل نامعتبر، مشتری بدون مسیر یا خارج از محدودهٔ مسیر، گروه‌بندی کالا، ماهیت و کدینگ حساب‌ها و ناسازگاری شرح و حساب اسناد. «قطعی» یعنی نقض قاعدهٔ محاسباتی؛ «نیازمند بازبینی» یعنی هشدار هیوریستیک و تصمیم با انسان است. اینجا هیچ داده‌ای تغییر نمی‌کند.</p>
    </div>

    <div className="flex flex-wrap gap-2" role="tablist" aria-label="حوزه">
      {DOMAINS.map(d => <button key={d.key} type="button" role="tab" aria-selected={domain === d.key} onClick={() => { setDomain(d.key); setRule('ALL'); setLimit(PAGE); }}
        className={`min-h-[40px] rounded-full border px-3 text-xs font-bold ${domain === d.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary'}`}>
        {d.label}{d.key !== 'ALL' ? ` (${fa(result.byDomain[d.key])})` : ` (${fa(total)})`}</button>)}
    </div>

    {loading && !snapshot && <div role="status" className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-text-secondary">در حال دریافت داده از DataProvider…</div>}
    {error && <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"><span>دریافت داده برای ممیزی ناموفق بود؛ نتیجهٔ زیر «بدون مشکل» تلقی نمی‌شود.</span><button type="button" onClick={() => { void refetch(); }} className="min-h-10 rounded-lg border border-danger/40 px-3 font-bold">تلاش مجدد</button></div>}
    {(!canFinance || !canAccounts) && <div role="status" className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-text-secondary">بخشی از ممیزی به‌دلیل نبود مجوز {!canFinance ? 'مشاهدهٔ مالی' : ''}{!canFinance && !canAccounts ? ' و ' : ''}{!canAccounts ? 'مشاهدهٔ مشتریان' : ''} اجرا نشد.</div>}

    {result.notEvaluated.length > 0 && <div role="status" className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs leading-6 text-text-secondary">
      <b className="text-text-main">ارزیابی‌نشده (نبود داده، نه «بدون مشکل»):</b>
      <ul className="mt-1 list-disc pr-5">{result.notEvaluated.map((n, i) => <li key={i}>{DOMAINS.find(d => d.key === n.domain)?.label}: {n.reason}</li>)}</ul>
    </div>}

    {rules.length > 0 && <div className="flex flex-wrap gap-2">
      {rules.sort((a, b) => b[1] - a[1]).map(([code, n]) => <button key={code} type="button" onClick={() => { setRule(rule === code ? 'ALL' : code); setLimit(PAGE); }}
        className={`min-h-[36px] rounded-lg border px-2 text-micro font-bold ${rule === code ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary'}`}>{QUALITY_RULE_LABELS[code] || code} · {fa(n)}</button>)}
    </div>}

    {visible.length === 0
      ? <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-text-secondary">{total === 0 && result.notEvaluated.length >= 5 ? 'داده‌ای برای ممیزی موجود نیست.' : 'مورد مشکوکی در این بخش یافت نشد.'}</div>
      : <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
        {visible.slice(0, limit).map(i => <li key={i.id} className="space-y-1 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {i.severity === 'HIGH' ? <ShieldAlert size={14} className="text-danger" /> : <AlertTriangle size={14} className="text-warning" />}
            <span className="text-xs font-black text-text-main">{QUALITY_RULE_LABELS[i.ruleCode] || i.ruleCode}</span>
            <span className={`rounded-full px-2 py-0.5 text-micro font-bold ${SEV[i.severity].cls}`}>{SEV[i.severity].label}</span>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-micro text-text-secondary">{i.confidence === 'DETERMINISTIC' ? 'قطعی' : 'نیازمند بازبینی'}</span>
          </div>
          <div className="text-xs text-text-main">{i.entityLabel}</div>
          <p className="text-xs leading-6 text-text-secondary">{i.message}{i.suggestion ? ` — ${i.suggestion}` : ''}</p>
        </li>)}
      </ul>}
    {visible.length > limit && <button type="button" onClick={() => setLimit(l => l + PAGE)} className="min-h-[44px] w-full rounded-lg border border-border text-xs font-bold text-text-main">نمایش بیشتر ({fa(visible.length - limit)} مورد دیگر)</button>}
  </Card>;
}
