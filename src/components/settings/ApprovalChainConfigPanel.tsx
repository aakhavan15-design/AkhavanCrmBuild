/**
 * ApprovalChainConfigPanel — configure multi-stage chains per RequestType (Settings)
 */
import React, { useMemo, useState } from 'react';
import { Select } from '../ui';
import { getPersianStatusLabel } from '../../lib/labels';
import type { AppState, RequestType } from '../../types';
import {
  ApprovalStepDef,
  ApprovalStepKey,
  DEFAULT_CHAIN_BY_FAMILY,
  FINANCE_REQUEST_TYPES,
  getChainTemplate,
  getChainsConfigFromState,
} from '../../lib/approvalChain';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Input';
import { cn } from '../../lib/utils';
import { Trash2, ChevronUp, ChevronDown, Plus } from 'lucide-react';

const ALL_TYPES: { value: RequestType; label: string }[] = [
  { value: 'LEAVE', label: 'مرخصی' },
  { value: 'MISSION', label: 'مأموریت' },
  { value: 'OVERTIME', label: 'اضافه‌کاری' },
  { value: 'ADVANCE', label: 'مساعده' },
  { value: 'ATTENDANCE', label: 'تردد' },
  { value: 'CERTIFICATE', label: 'گواهی' },
  { value: 'PAYMENT', label: 'پرداخت' },
  { value: 'EXPENSE', label: 'هزینه' },
  { value: 'PURCHASE', label: 'خرید' },
  { value: 'EQUIPMENT', label: 'تجهیزات' },
  { value: 'IT_SUPPORT', label: 'پشتیبانی فناوری اطلاعات' },
  { value: 'GENERAL', label: 'عمومی' },
];

const STEP_KEYS: { value: ApprovalStepKey; label: string }[] = [
  { value: 'SUBMITTED', label: 'ثبت' },
  { value: 'MANAGER_REVIEW', label: 'بررسی مدیر' },
  { value: 'FINANCE_REVIEW', label: 'بررسی مالی' },
  { value: 'ERP_HANDOFF', label: 'تحویل به سامانه مالی' },
  { value: 'APPROVED', label: 'تأیید نهایی' },
  { value: 'COMPLETED', label: 'بسته' },
];

const ROLES: ApprovalStepDef['role'][] = ['CREATOR', 'MANAGER', 'FINANCE', 'ERP', 'SYSTEM'];

export function ApprovalChainConfigPanel({
  state,
  updateState,
  canEdit,
}: {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  canEdit: boolean;
}) {
  const [selectedType, setSelectedType] = useState<RequestType>('LEAVE');
  const config = getChainsConfigFromState(state);
  const effective = useMemo(
    () => getChainTemplate(selectedType, config),
    [selectedType, config]
  );
  const [draftSteps, setDraftSteps] = useState<ApprovalStepDef[] | null>(null);
  const steps = draftSteps || effective;

  const loadType = (t: RequestType) => {
    setSelectedType(t);
    setDraftSteps(null);
  };

  const ensureDraft = () => {
    if (!draftSteps) setDraftSteps(effective.map((s) => ({ ...s })));
  };

  const save = () => {
    if (!canEdit || !draftSteps || draftSteps.length < 2) return;
    updateState((draft) => {
      if (!draft.settings) (draft as Record<string, unknown>).settings = {};
      if (!(draft.settings as Record<string, unknown>).orgConfig) (draft.settings as Record<string, unknown>).orgConfig = {};
      const chains = { ...((draft.settings as Record<string, unknown>).orgConfig.approvalChains || {}) };
      chains[selectedType] = draftSteps;
      (draft.settings as Record<string, unknown>).orgConfig.approvalChains = chains;
    });
    setDraftSteps(null);
  };

  const resetToDefault = () => {
    if (!canEdit) return;
    updateState((draft) => {
      if (!(draft.settings as Record<string, unknown>)?.orgConfig?.approvalChains) return;
      const chains = { ...(draft.settings as Record<string, unknown>).orgConfig.approvalChains };
      delete chains[selectedType];
      (draft.settings as Record<string, unknown>).orgConfig.approvalChains = chains;
    });
    setDraftSteps(null);
  };

  const previewNodes = steps.map((s, i) => ({
    id: `cfg-${i}`,
    label: s.label,
    state: (i === 0 ? 'done' : i === 1 ? 'active' : 'pending') as 'done' | 'active' | 'pending',
    meta: s.erpHandoff ? 'سامانه مالی' : getPersianStatusLabel(s.role),
  }));

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h3 className="text-sm font-extrabold text-text-main">زنجیره تأیید درخواست‌ها</h3>
        <p className="mt-1 text-xs text-text-secondary leading-relaxed">
          برای هر نوع درخواست مسیر چندمرحله‌ای تعریف کنید. درخواست‌های جدید از این تنظیمات استفاده می‌کنند.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ALL_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => loadType(t.value)}
            className={cn(
              'px-2.5 py-1 rounded-full text-caption font-bold border cursor-pointer',
              selectedType === t.value
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-canvas border-border text-text-secondary hover:border-primary/40'
            )}
          >
            {t.label}
            {FINANCE_REQUEST_TYPES.includes(t.value) ? ' · مالی' : ''}
          </button>
        ))}
      </div>

      {/* پیش‌نمایش عمودی موبایل‌فرندلی */}
      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="text-xs font-bold text-text-secondary mb-3">پیش‌نمایش زنجیره</p>
        <div className="flex flex-col gap-0">
          {steps.map((s, i) => (
            <div key={`pv-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border-2',
                  i === 0 ? 'bg-primary text-on-primary border-primary' : 'bg-canvas text-text-secondary border-border'
                )}>{i + 1}</span>
                {i < steps.length - 1 && <div className="w-0.5 flex-1 min-h-4 bg-border my-0.5" />}
              </div>
              <div className="pb-3 min-w-0">
                <p className="text-sm font-semibold text-text-main">{s.label || STEP_KEYS.find(k => k.value === s.key)?.label}</p>
                <p className="text-caption text-text-secondary">
                  {getPersianStatusLabel(s.role)}
                  {s.erpHandoff ? ' · ارسال به سامانه مالی' : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* مراحل عمودی تمیز */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={`${step.key}-${index}`}
            className="rounded-2xl border border-border bg-surface p-3 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                {index + 1}
              </span>
              <div className="flex items-center gap-1">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      aria-label="جابه‌جایی به بالا"
                      disabled={index === 0}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-canvas disabled:opacity-30"
                      onClick={() => {
                        if (index === 0) return;
                        ensureDraft();
                        setDraftSteps((prev) => {
                          const base = prev || effective.map((s) => ({ ...s }));
                          const next = [...base];
                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                          return next;
                        });
                      }}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="جابه‌جایی به پایین"
                      disabled={index === steps.length - 1}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-canvas disabled:opacity-30"
                      onClick={() => {
                        if (index >= steps.length - 1) return;
                        ensureDraft();
                        setDraftSteps((prev) => {
                          const base = prev || effective.map((s) => ({ ...s }));
                          const next = [...base];
                          [next[index], next[index + 1]] = [next[index + 1], next[index]];
                          return next;
                        });
                      }}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="حذف مرحله"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--c-burgundy)] hover:bg-[var(--c-burgundy-soft)]"
                      onClick={() => {
                        if (steps.length <= 2) return;
                        if (!window.confirm('این مرحله حذف شود؟')) return;
                        ensureDraft();
                        setDraftSteps((prev) => {
                          const base = prev || effective.map((s) => ({ ...s }));
                          return base.filter((_, i) => i !== index);
                        });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-caption font-bold text-text-secondary">نام مرحله</label>
              <Select
                aria-label={`نام مرحله ${index + 1}`}
                disabled={!canEdit}
                value={step.key}
                onChange={(e) => {
                  ensureDraft();
                  setDraftSteps((prev) => {
                    const base = prev || effective.map((s) => ({ ...s }));
                    const next = [...base];
                    const key = e.target.value as ApprovalStepKey;
                    const label = STEP_KEYS.find((k) => k.value === key)?.label || next[index].label;
                    next[index] = { ...next[index], key, label };
                    return next;
                  });
                }}
                className="w-full"
              >
                {STEP_KEYS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="block text-caption font-bold text-text-secondary">تأییدکننده</label>
              <Select
                aria-label={`تأییدکننده مرحله ${index + 1}`}
                disabled={!canEdit}
                value={step.role}
                onChange={(e) => {
                  ensureDraft();
                  setDraftSteps((prev) => {
                    const base = prev || effective.map((s) => ({ ...s }));
                    const next = [...base];
                    next[index] = { ...next[index], role: e.target.value as ApprovalStepDef['role'] };
                    return next;
                  });
                }}
                className="w-full"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{getPersianStatusLabel(r)}</option>
                ))}
              </Select>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-3 py-2.5 cursor-pointer">
              <span className="text-xs font-semibold text-text-main">ارسال به سامانه مالی</span>
              <Switch
                checked={!!step.erpHandoff}
                disabled={!canEdit}
                onChange={(e) => {
                  ensureDraft();
                  setDraftSteps((prev) => {
                    const base = prev || effective.map((s) => ({ ...s }));
                    const next = [...base];
                    next[index] = { ...next[index], erpHandoff: e.target.checked };
                    return next;
                  });
                }}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              ensureDraft();
              setDraftSteps((prev) => {
                const base = prev || effective.map((s) => ({ ...s }));
                return [
                  ...base,
                  {
                    key: 'MANAGER_REVIEW' as ApprovalStepKey,
                    label: 'بررسی مدیر',
                    role: 'MANAGER' as ApprovalStepDef['role'],
                    erpHandoff: false,
                  },
                ];
              });
            }}
          >
            <Plus size={14} className="ms-1" />
            افزودن مرحله
          </Button>
        )}
        <Button variant="primary" size="sm" disabled={!canEdit || !draftSteps} onClick={save}>
          ذخیره زنجیره
        </Button>
        <Button variant="ghost" size="sm" disabled={!canEdit} onClick={resetToDefault}>
          بازگشت به پیش‌فرض
        </Button>
      </div>
    </div>
  );
}
