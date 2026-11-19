/**
 * CommandPalette — Global search + Intent/Semantic routes (2026)
 * Keyword + synonym + intent matching. Zero-clutter empty state.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Building2, FileText, CheckSquare, Sparkles, ArrowLeft,
  Wallet, LayoutDashboard, Activity, Map
} from 'lucide-react';
import { getPersianStatusLabel } from '../lib/labels';
import { AppState } from '../types';
import { formatCurrency, formatAppDate } from '../lib/utils';
import { RBACService } from '../lib/rbac';
import { matchIntentRoutes, scoreText } from '../lib/semanticSearch';
import { track, AnalyticsEvents } from '../lib/analytics';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
}

type ResultItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  score: number;
  kind: 'intent' | 'record';
  action: () => void;
};

export function CommandPalette({ isOpen, onClose, state, updateState }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      track(AnalyticsEvents.COMMAND_PALETTE, { action: 'open' });
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as ResultItem[];

    const rbac = new RBACService(state);
    const config = state.settings?.orgConfig || ({} as Record<string, unknown>);
    const results: ResultItem[] = [];

    // 1) Intent / semantic routes (always ranked high when they match)
    const intents = matchIntentRoutes(q);
    for (const route of intents) {
      // light permission gate for known sensitive paths
      if (route.path.startsWith('/finance') && !(rbac.hasPermission('finance.view') || rbac.can?.('finance', 'VIEW'))) {
        // still show but lower; keep simple — skip if no finance perm key
        if (!rbac.hasPermission('accounts.view')) continue;
      }
      const Icon =
        route.id.includes('finance') ? Wallet :
        route.id.includes('command') ? LayoutDashboard :
        route.id.includes('activ') ? Activity :
        route.id.includes('geo') ? Map :
        route.id.includes('quote') ? FileText :
        route.id.includes('task') || route.id.includes('overdue') || route.id.includes('priority') ? CheckSquare :
        route.id.includes('customer') ? Building2 :
        Sparkles;

      results.push({
        id: route.id,
        title: route.title,
        subtitle: route.subtitle,
        icon: Icon,
        score: route.score + 20,
        kind: 'intent',
        action: () => {
          navigate(route.path);
          onClose();
        },
      });
    }

    // 2) Accounts
    if (rbac.hasPermission('accounts.view')) {
      (state.accounts || []).forEach((a) => {
        const score = Math.max(
          scoreText(a.name || '', q),
          scoreText(a.code || '', q),
          a.phone && a.phone.includes(q) ? 70 : 0
        );
        if (score >= 40) {
          results.push({
            id: `acc_${a.id}`,
            title: a.name,
            subtitle: `مشتری | کد: ${a.code || '-'} | تلفن: ${a.phone || '-'}`,
            icon: Building2,
            score,
            kind: 'record',
            action: () => {
              updateState((d) => {
                d.activeContextAccountId = a.id;
                d.activeContextCustomerId = a.id;
              });
              navigate('/accounts');
              onClose();
            },
          });
        }
      });
    }

    // 3) Quotes
    if (config.enableQuotes !== false && rbac.hasPermission('quotes.view')) {
      (state.quotes || []).forEach((qt) => {
        const score = scoreText(qt.quoteNumber || '', q);
        if (score >= 40) {
          results.push({
            id: `qt_${qt.id}`,
            title: `پیش‌فاکتور ${qt.quoteNumber}`,
            subtitle: `مبلغ: ${formatCurrency(qt.totalAmount)} ریال | ${getPersianStatusLabel(qt.status)}`,
            icon: FileText,
            score,
            kind: 'record',
            action: () => {
              navigate('/quotes');
              onClose();
            },
          });
        }
      });
    }

    // 4) Tasks
    if (config.enableTasks !== false) {
      (state.tasks || []).forEach((t) => {
        const score = Math.max(
          scoreText(t.title || '', q),
          scoreText(t.description || '', q)
        );
        if (score >= 40) {
          results.push({
            id: `tsk_${t.id}`,
            title: t.title,
            subtitle: `وظیفه | مهلت: ${formatAppDate(t.dueDate, state.settings?.locale)} | ${getPersianStatusLabel(t.status)}`,
            icon: CheckSquare,
            score,
            kind: 'record',
            action: () => {
              navigate('/tasks');
              onClose();
            },
          });
        }
      });
    }

    // Rank: score desc, intents slightly preferred when equal
    return results
      .sort((a, b) => b.score - a.score || (a.kind === 'intent' ? -1 : 1))
      .slice(0, 12);
  }, [query, state, updateState, navigate, onClose]);

  if (!isOpen) return null;

  const isRtl = state.settings?.locale?.rtl !== false;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-text-main/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-200 border border-border">
        <div className="p-4 border-b border-border flex items-center gap-3 bg-canvas">
          <Search size={20} className="text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو یا دستور (مثلاً: وظایف معوق، مالی، مشتری...)"
            className="flex-1 bg-transparent text-text-main placeholder:text-text-secondary text-sm outline-none font-bold"
            dir={isRtl ? 'rtl' : 'ltr'}
            aria-label="جستجوی سراسری و قصد"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-main rounded-md bg-surface border border-border cursor-pointer shadow-sm"
          >
            <span className="me-1.5 text-xs font-medium text-text-secondary">بستن</span>
            <kbd className="se-kbd">خروج</kbd>
          </button>
        </div>

        <div className="max-h-(--size-400) overflow-y-auto p-2" dir={isRtl ? 'rtl' : 'ltr'}>
          {!query ? (
            <div className="p-6 text-center text-text-secondary flex flex-col items-center justify-center gap-3">
              <Sparkles size={28} className="opacity-30 text-primary" />
              <p className="text-xs font-bold">جستجوی معنایی و دستورات سریع</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                {['وظایف معوق', 'مالی', 'مشتری', 'پیش‌فاکتور', 'تسک جدید'].map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => setQuery(hint)}
                    className="px-2.5 py-1 rounded-full text-caption font-medium bg-canvas border border-border hover:border-primary/40 cursor-pointer"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="p-1 space-y-0.5">
              <span className="text-mini text-text-secondary font-bold block mb-1.5 px-2">
                نتایج ({searchResults.length.toLocaleString('fa-IR')})
              </span>
              {searchResults.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-canvas text-right transition-colors group cursor-pointer border border-transparent hover:border-border"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <IconComponent size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <strong className="text-sm font-bold text-text-main block group-hover:text-primary truncate">
                        {item.title}
                      </strong>
                      <span className="text-caption text-text-secondary block mt-0.5 truncate">
                        {item.kind === 'intent' ? 'دستور · ' : ''}
                        {item.subtitle}
                      </span>
                    </div>
                    <ArrowLeft size={14} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-xs font-bold text-text-secondary">هیچ نتیجه‌ای یافت نشد.</div>
          )}
        </div>
      </div>
    </div>
  );
}
