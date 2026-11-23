import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { AppState } from '../types';
import { RBACService } from '../lib/rbac';
import { makeCanAccess } from '../lib/navigation';
import { getModuleLanding, isPlannedTile, type ModuleLandingTile } from '../lib/moduleLanding';
import { EmptyState } from './ui/EmptyState';
import { formatCount } from '../lib/format';
import { cn } from '../lib/utils';

interface ModuleLandingWorkspaceProps {
  state: AppState;
}

const normalize = (value: string) =>
  value.trim().toLocaleLowerCase('fa-IR').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');

const sortTilesPlannedLast = (tiles: ModuleLandingTile[]): ModuleLandingTile[] => {
  const active = tiles.filter(t => !isPlannedTile(t));
  const planned = tiles.filter(t => isPlannedTile(t));
  return [...active, ...planned];
};

/**
 * F3-01 / F3-02 / F3-03:
 * طراحی فوق‌مینیمال و دسته‌بندی‌شدهٔ ورودی هر فضای کاری طبق MASTER_SPEC §4:
 * - سربرگ آرام (فقط عنوان + توضیح کوتاه، بدون کارت آماری بزرگ)
 * - جست‌وجوی سریع چسبیده
 * - پشتهٔ کارت‌های دسته (کاشی‌ها ۴ستونه، جمع‌شده به ۴ کاشی اول، بدون متن توضیح روی کاشی)
 * - کاشی‌های «در دست تکمیل» در انتها، کم‌رنگ و با نقطهٔ وضعیت ظریف
 */
export function ModuleLandingWorkspace({ state }: ModuleLandingWorkspaceProps) {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const definition = getModuleLanding(moduleId);
  const canAccess = useMemo(() => makeCanAccess(new RBACService(state)), [state]);

  const visibleGroups = useMemo(() => {
    if (!definition) return [];
    const q = normalize(query);
    return definition.groups
      .map(group => {
        const permitted = group.tiles.filter(
          item =>
            canAccess(item.perm) &&
            (!q || normalize(`${item.label} ${item.description} ${group.title}`).includes(q))
        );
        return {
          ...group,
          tiles: sortTilesPlannedLast(permitted),
        };
      })
      .filter(group => group.tiles.length > 0);
  }, [definition, canAccess, query]);

  if (!definition) {
    return (
      <EmptyState surface="module_landing_workspace_1"
        title="فضای کاری پیدا نشد"
        description="این نشانی به یکی از فضاهای کاری معتبر اشاره نمی‌کند."
      />
    );
  }

  // Landing access must match the same canonical module permissions used by the
  // mobile drawer and desktop sidebar, not just permission to load the URL.
  if (!canAccess(`module:${definition.id}`)) {
    return <EmptyState surface="module_landing_access_denied"
      title="دسترسی به این فضای کاری مجاز نیست"
      description="هیچ دسترسی تأییدشده‌ای برای زیرمجموعه‌های این فضا ثبت نشده است."/>
  }

  const visibleCount = visibleGroups.reduce((sum, group) => sum + group.tiles.length, 0);
  const Icon = definition.icon;
  const isSearching = query.trim().length > 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-3.5 px-2 pb-24 pt-2 sm:px-4 sm:pt-3" dir="rtl">
      <header className="flex items-center gap-3 px-1">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 id="module-landing-heading" data-tour-heading className="truncate text-base font-extrabold tracking-tight text-text-main sm:text-lg">
            {definition.title}
          </h1>
          <p className="mt-0.5 truncate text-xs text-text-secondary">{definition.description}</p>
        </div>
      </header>

      <div className="sticky top-[calc(var(--header-h)+8px)] z-20">
        <label className="flex h-11 items-center gap-2.5 rounded-2xl border border-border bg-surface/95 px-3.5 text-text-secondary shadow-sm backdrop-blur-xl transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <Search size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
          <input
            id="module-landing-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={`جست‌وجو در ${definition.title}...`}
            aria-label={`جست‌وجو در ${definition.title}`}
            className="h-full min-w-0 flex-1 bg-transparent text-xs font-medium text-text-main outline-none placeholder:text-text-muted sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="پاک کردن جست‌وجو"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-muted transition hover:bg-sunken hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
        {isSearching && (
          <p className="mt-1.5 px-1 text-caption text-text-muted" role="status">
            {formatCount(visibleCount)} نتیجه در این فضای کاری
          </p>
        )}
      </div>

      {visibleCount === 0 ? (
        <EmptyState surface="module_landing_workspace_2"
          title="مقصدی پیدا نشد"
          description={
            isSearching
              ? 'عبارت دیگری را جست‌وجو کنید یا جست‌وجو را پاک کنید.'
              : 'برای نقش فعلی شما مقصد مجازی در این فضا فعال نیست.'
          }
        />
      ) : (
        <div className="space-y-3">
          {visibleGroups.map(group => {
            const hasMore = group.tiles.length > 4;
            const expanded = isSearching ? true : !!expandedGroups[group.title];
            const shownTiles = expanded ? group.tiles : group.tiles.slice(0, 4);

            return (
              <section
                key={group.title}
                className="overflow-hidden rounded-2xl border border-border/80 bg-surface"
                aria-label={group.title}
              >
                <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-1">
                  <h2 className="text-xs font-extrabold tracking-tight text-text-main sm:text-sm">
                    {group.title}
                  </h2>
                  {hasMore && !isSearching && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedGroups(current => ({
                          ...current,
                          [group.title]: !expanded,
                        }))
                      }
                      aria-expanded={expanded}
                      className="min-h-8 px-1.5 text-caption font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                    >
                      {expanded ? 'مشاهده کمتر' : `مشاهده بیشتر (${formatCount(group.tiles.length)})`}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-x-1.5 gap-y-3 px-2 py-3 sm:gap-x-3 sm:px-3.5 sm:py-3.5">
                  {shownTiles.map(item => {
                    const TileIcon = item.icon;
                    const planned = isPlannedTile(item);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item.path)}
                        title={item.description}
                        aria-label={`${item.label}؛ ${item.description}${planned ? '؛ در دست تکمیل' : ''}`}
                        className={cn(
                          'group flex min-w-0 min-h-touch flex-col items-center gap-1.5 rounded-2xl px-1 py-1.5 text-center transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[.97] cursor-pointer',
                          planned && 'opacity-70 hover:opacity-95'
                        )}
                      >
                        <span
                          className={cn(
                            'relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition-colors',
                            planned
                              ? 'border-border/70 bg-sunken/70 text-text-muted'
                              : 'border-primary/10 bg-primary/5 text-primary group-hover:border-primary/30 group-hover:bg-primary/10'
                          )}
                        >
                          <TileIcon size={21} strokeWidth={1.5} aria-hidden="true" />
                          {planned && (
                            <span
                              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-warning"
                              aria-label="در دست تکمیل"
                            />
                          )}
                        </span>
                        <span className="line-clamp-2 w-full text-[11px] font-semibold leading-4 text-text-main sm:text-xs">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
