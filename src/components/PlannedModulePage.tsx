import React, { useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CircleDashed, ExternalLink, ListChecks } from 'lucide-react';
import { AppState } from '../types';
import { RBACService } from '../lib/rbac';
import { makeCanAccess } from '../lib/navigation';
import { MODULE_LANDINGS } from '../lib/moduleLanding';
import { PLANNED_DELIVERABLES, getPlannedModule } from '../lib/plannedModules';
import { EmptyState } from './ui/EmptyState';
import { Button } from './ui/Button';

interface PlannedModulePageProps { state: AppState }
const legacyTiles: Record<string, string> = {
  'hr-applicants': 'hr-recruitment',
  'fin-reports': 'finance-reports',
  'fin-liquidity': 'treasury',
};

/**
 * صفحه وضعیت واحدهای «در دست تکمیل».
 * فقط نیازمندی‌ها و وضعیت واقعی ساخت را نشان می‌دهد؛ هیچ داده یا عملکرد نمایشی ندارد.
 */
export function PlannedModulePage({ state }: PlannedModulePageProps) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const item = getPlannedModule(params.get('item'));
  const canAccess = useMemo(() => makeCanAccess(new RBACService(state)), [state]);
  const tileId = item && (legacyTiles[item.id] ?? item.id);
  const owner = MODULE_LANDINGS.find(module => module.groups.some(group => group.tiles.some(tile => tile.id === tileId)));
  const tile = owner?.groups.flatMap(group => group.tiles).find(tile => tile.id === tileId);

  if (!item || !canAccess(item.perm) || (tile && !canAccess(tile.perm))) {
    return <EmptyState surface="planned_module_page" title="بخش پیدا نشد" description="این بخش وجود ندارد یا سطح دسترسی شما اجازه مشاهده آن را نمی‌دهد." actionLabel="بازگشت" onAction={() => navigate(-1)} />;
  }
  if (tile && !tile.path.startsWith('/planned')) return <Navigate to={tile.path} replace />;
  const Icon = tile?.icon ?? CircleDashed;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 pb-24 pt-4 sm:px-5" dir="rtl">
      <button type="button" onClick={() => (owner ? navigate(`/workspace/${owner.id}`) : navigate(-1))} className="flex w-fit items-center gap-1.5 text-caption font-medium text-text-muted transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowRight size={14} aria-hidden="true" /> {owner ? owner.title : 'بازگشت'}
      </button>

      <section className="rounded-3xl border border-border bg-surface px-4 py-5 shadow-sm sm:px-6">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/5 text-primary">
            <Icon size={24} strokeWidth={1.7} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-micro font-medium text-text-muted">{item.unitLabel}</p>
            <h1 data-tour-heading className="mt-0.5 text-lg font-extrabold tracking-tight text-text-main">{item.title}</h1>
            <p className="mt-1 text-xs leading-6 text-text-secondary">{item.summary}</p>
          </div>
        </div>
        <p role="status" className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-caption leading-6 text-text-main">
          وضعیت: <strong>{item.existing ? 'بخش مرتبط موجود — تکمیل و آزمون نهایی باز است' : 'در دست تکمیل — ساخته‌نشده'}</strong>. {item.existing ? 'برای امکاناتی که واقعاً موجودند از دکمه ورود به بخش مرتبط استفاده کنید؛ تکمیل همه نیازمندی‌ها هنوز تأیید نشده است.' : 'ورودی منو برای جایگاه نهایی این بخش ثبت شده و هیچ داده یا عملکرد نمایشی به‌جای اجرای واقعی نشان داده نمی‌شود.'}
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-surface px-4 py-4 sm:px-6" aria-label="نیازمندی‌ها">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-text-main"><ListChecks size={16} aria-hidden="true" /> نیازمندی‌های این بخش</h2>
        <ul className="mt-3 space-y-2">
          {item.requirements.map(text => (
            <li key={text} className="flex items-start gap-2 text-xs leading-6 text-text-secondary">
              <CircleDashed size={14} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" /> {text}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-border bg-surface px-4 py-4 sm:px-6" aria-label="تحویل‌شدنی‌ها">
        <h2 className="text-sm font-extrabold text-text-main">تحویل‌شدنی‌های الزامی</h2>
        <p className="mt-1 text-micro text-text-muted">هیچ مورد فقط با ساخت رابط کاربری کامل تلقی نمی‌شود.</p>
        <ul className="mt-3 divide-y divide-border/70">
          {PLANNED_DELIVERABLES.map(name => (
            <li key={name} className="flex items-center justify-between gap-3 py-2 text-xs text-text-main">
              <span>{name}</span>
              <span className="rounded-full bg-sunken px-2 py-0.5 text-micro font-bold text-text-secondary">{item.existing ? "نیازمند تأیید" : "ساخته‌نشده"}</span>
            </li>
          ))}
        </ul>
      </section>

      {item.existing && (
        <section className="rounded-3xl border border-border bg-surface px-4 py-4 sm:px-6" aria-label="بخش موجود مرتبط">
          <h2 className="text-sm font-extrabold text-text-main">بخش موجود مرتبط</h2>
          <p className="mt-1 text-xs leading-6 text-text-secondary">بخشی از این قابلیت در برنامه وجود دارد ولی کامل و تأییدشده نیست.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(item.existing!.path)}>
            <ExternalLink size={14} aria-hidden="true" /> {item.existing.label}
          </Button>
        </section>
      )}
    </main>
  );
}
