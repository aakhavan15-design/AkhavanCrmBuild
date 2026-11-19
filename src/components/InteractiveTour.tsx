import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  X,
  Sparkles,
  Compass,
  Play,
  RotateCcw,
  ChevronRight
} from 'lucide-react';
import { AppState } from '../types';
import {
  TourStep,
  WHATS_NEW_ITEMS,
  getStepsForModuleAndRole,
  loadTourState,
  saveTourState,
  TourStorageState,
  getAvailableModules,
  moduleForPath,
  routeForModule
} from '../services/tourEngine';
import { cn } from '../lib/utils';
import { makeCanAccess, pathMatches } from '../lib/navigation';
import { RBACService } from '../lib/rbac';

interface InteractiveTourProps {
  state: AppState;
  updateState?: (updater: (draft: AppState) => AppState | void) => void;
  defaultModule?: string;
}

function isVisibleTourTarget(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 8 && rect.height > 8 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0.05;
}

function findVisibleTarget(selector: string): Element | null {
  for (const part of selector.split(',').map(s => s.trim()).filter(Boolean)) {
    if (part === '#tour-page') continue;
    const el = document.querySelector(part);
    if (el && isVisibleTourTarget(el)) return el;
  }
  return null;
}

function findSemanticTourTarget(step: TourStep): Element | null {
  const root = document.querySelector('#tour-page');
  if (!root) return null;
  const isOverview = step.id.endsWith('-overview') || step.id === 'home-overview' || step.id === 'command-overview';
  const selectors = isOverview
    ? ['[data-tour-heading]', 'h1', 'h2', 'h3', '[data-tour-primary]', 'main section', 'section']
    : ['[data-tour-primary]', '[data-tour-actions]', '[data-tour-heading]', 'form', '[role="tablist"]', 'table', 'button', '[role="button"]', 'input'];
  for (const selector of selectors) {
    const candidates = Array.from(root.querySelectorAll(selector));
    const found = candidates.find(isVisibleTourTarget);
    if (found) return found;
  }
  return null;
}

export function InteractiveTour({ state, updateState }: InteractiveTourProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tourState, setTourState] = useState<TourStorageState>(() => loadTourState());
  const [showSelectorModal, setShowSelectorModal] = useState(false);
  const [showWhatsNewModal, setShowWhatsNewModal] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const currentUser = state?.users?.find(u => u.id === state?.currentUserId);
  const currentRole = state?.roles?.find(r => r.id === currentUser?.roleId);
  const canUseTour = useMemo(() => {
    const rbac = new RBACService(state);
    const canAccess = makeCanAccess(rbac);
    const permissions: Record<string, string> = {
      global: 'home', workspace: 'module:home', opportunities: 'leads',
      operations: 'operations_control', 'geo-intelligence': 'geo_intelligence',
      'sync-center': 'settings', 'personnel-file': 'profile',
    };
    return (module: string) => Boolean(rbac.getCurrentUser()) && canAccess(permissions[module] || module);
  }, [state]);

  const activeSteps = useMemo(() => {
    if (!tourState.activeModule || !canUseTour(tourState.activeModule)) return [];
    return getStepsForModuleAndRole(tourState.activeModule, currentRole?.name);
  }, [tourState.activeModule, currentRole?.name, canUseTour]);

  const currentStep: TourStep | undefined = activeSteps[tourState.currentStepIndex];

  // محاسبه موقعیت Spotlight با MutationObserver و اسکرول نرم سازگار با reduced-motion
  useEffect(() => {
    if (!currentStep || tourState.isPaused) {
      setTargetRect(null);
      return;
    }

    const updateRect = () => {
      let el: Element | null = null;
      if (currentStep.targetSelector) {
        el = findVisibleTarget(currentStep.targetSelector);
      }
      if (!el) {
        el = findSemanticTourTarget(currentStep);
      }

      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
          el.scrollIntoView({ 
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', 
            block: 'center' 
          });
        }
      } else {
        setTargetRect(null);
      }
    };

    updateRect();

    let animationFrame = 0;
    const scheduleUpdate = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateRect();
      });
    };

    const workspace = document.querySelector('#tour-page');
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(workspace || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });

    const resizeObserver = typeof ResizeObserver !== 'undefined' && workspace
      ? new ResizeObserver(scheduleUpdate)
      : null;
    if (resizeObserver && workspace) resizeObserver.observe(workspace);

    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [currentStep, tourState.isPaused, location.pathname]);

  // کلیدهای کیبورد (Escape برای بستن، پیکان برای گام‌ها)
  useEffect(() => {
    if (!currentStep || tourState.isPaused) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pauseTour();
      } else if (e.key === 'ArrowLeft') {
        handleNext();
      } else if (e.key === 'ArrowRight') {
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentStep, tourState]);

  const persist = (next: TourStorageState) => {
    setTourState(next);
    saveTourState(next);
  };

  const startTour = (module: string) => {
    const route = routeForModule(module);
    if (!route || !canUseTour(module) || !getStepsForModuleAndRole(module, currentRole?.name).length) return;
    if (module !== 'global' && moduleForPath(location.pathname) !== module && !pathMatches(location.pathname, route)) {
      navigate(route);
    }
    setTargetRect(null);
    persist({
      ...tourState,
      activeModule: module,
      currentStepIndex: 0,
      isPaused: false,
    });
    setShowSelectorModal(false);
  };

  const handleNext = () => {
    if (tourState.currentStepIndex >= activeSteps.length - 1) {
      finishTour();
    } else {
      const nextIdx = tourState.currentStepIndex + 1;
      const nextStep = activeSteps[nextIdx];
      if (nextStep?.actionRoute && location.pathname !== nextStep.actionRoute) {
        navigate(nextStep.actionRoute);
      }
      persist({
        ...tourState,
        currentStepIndex: nextIdx,
      });
    }
  };

  const handlePrev = () => {
    if (tourState.currentStepIndex > 0) {
      const prevIdx = tourState.currentStepIndex - 1;
      const prevStep = activeSteps[prevIdx];
      if (prevStep?.actionRoute && location.pathname !== prevStep.actionRoute) {
        navigate(prevStep.actionRoute);
      }
      persist({
        ...tourState,
        currentStepIndex: prevIdx,
      });
    }
  };

  const finishTour = () => {
    const mod = tourState.activeModule || 'global';
    persist({
      ...tourState,
      activeModule: null,
      currentStepIndex: 0,
      isPaused: false,
      completedModules: {
        ...tourState.completedModules,
        [mod]: true,
      },
    });
    if (updateState) {
      updateState(draft => {
        draft.onboardingCompleted = true;
      });
    }
  };

  const pauseTour = () => {
    persist({
      ...tourState,
      isPaused: true,
    });
  };

  const resetAllTours = () => {
    persist({
      activeModule: null,
      currentStepIndex: 0,
      isPaused: false,
      completedModules: {},
    });
  };

  useEffect(() => {
    const onOpenTour = (event: Event) => {
      const module = event instanceof CustomEvent ? event.detail?.module : undefined;
      const mod = typeof module === 'string' ? module : 'global';
      startTour(mod);
    };
    const onOpenMenu = () => setShowSelectorModal(true);
    const onOpenWhatsNew = () => setShowWhatsNewModal(true);

    window.addEventListener('open-akhavan-tour', onOpenTour);
    window.addEventListener('open-akhavan-tour-menu', onOpenMenu);
    window.addEventListener('open-akhavan-whats-new', onOpenWhatsNew);
    return () => {
      window.removeEventListener('open-akhavan-tour', onOpenTour);
      window.removeEventListener('open-akhavan-tour-menu', onOpenMenu);
      window.removeEventListener('open-akhavan-whats-new', onOpenWhatsNew);
    };
  }, [tourState, location.pathname, canUseTour, currentRole?.name]);

  const isTourActive = !!currentStep && !tourState.isPaused;

  return (
    <>
      {isTourActive && (
        <div className="fixed inset-0 z-50 pointer-events-auto overflow-hidden font-premium" dir="rtl">
          <div className="absolute inset-0 bg-black/40 transition-opacity duration-300" onClick={pauseTour} />

          {targetRect && (
            <div
              className="absolute pointer-events-none rounded-2xl ring-4 ring-primary shadow-2xl transition-all duration-300"
              style={{
                top: Math.max(0, targetRect.top - 6),
                left: Math.max(0, targetRect.left - 6),
                width: targetRect.width + 12,
                height: targetRect.height + 12,
                boxShadow: '0 0 0 9999px color-mix(in srgb, var(--c-navy-dark) 45%, transparent)',
              }}
            />
          )}

          <div
            className={cn(
              "absolute z-10 w-(--vp-tour-w) max-w-sm sm:max-w-md bg-surface/98 border border-border rounded-3xl p-5 shadow-2xl backdrop-blur-xl transition-all duration-300",
              !targetRect && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              targetRect && targetRect.top > 320 ? "bottom-6 left-1/2 -translate-x-1/2" : "top-20 left-1/2 -translate-x-1/2"
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
                  {(tourState.currentStepIndex + 1).toLocaleString('fa-IR')}
                </span>
                <span className="text-caption font-bold text-ink-soft">
                  گام {(tourState.currentStepIndex + 1).toLocaleString('fa-IR')} از {activeSteps.length.toLocaleString('fa-IR')}
                </span>
                {currentStep.isNewFeature && (
                  <span className="px-2 py-0.5 rounded-full text-nano font-black bg-amber-100 text-amber-800 border border-amber-300">
                    جدید
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={pauseTour}
                className="p-1 rounded-lg text-ink-soft hover:text-ink hover:bg-canvas transition"
                title="بستن آموزش"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1.5 mb-4">
              <h3 className="text-sm sm:text-base font-extrabold text-ink leading-tight">
                {currentStep.title}
              </h3>
              <p className="text-xs sm:text-compact text-ink-soft leading-relaxed">
                {currentStep.content}
              </p>
            </div>

            {currentStep.actionRoute && (
              <button
                type="button"
                onClick={() => {
                  navigate(currentStep.actionRoute!);
                  handleNext();
                }}
                className="w-full mb-3 py-2 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <span>{currentStep.actionLabel || 'مشاهده این بخش'}</span>
                <ChevronRight size={14} />
              </button>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/80">
              <button
                type="button"
                onClick={finishTour}
                className="text-xs font-bold text-ink-soft hover:text-ink py-1.5 px-2 rounded-lg transition cursor-pointer"
              >
                رد کردن
              </button>

              <div className="flex items-center gap-1">
                {activeSteps.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === tourState.currentStepIndex ? "w-6 bg-primary" : "w-1.5 bg-border"
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                {tourState.currentStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="p-2 rounded-xl border border-border bg-canvas hover:bg-surface text-ink text-xs font-bold transition active:scale-95 cursor-pointer"
                    title="قبلی"
                  >
                    <ArrowRight size={14} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                >
                  {tourState.currentStepIndex >= activeSteps.length - 1 ? (
                    <>
                      <CheckCircle2 size={14} />
                      <span>پایان</span>
                    </>
                  ) : (
                    <>
                      <span>بعدی</span>
                      <ArrowLeft size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSelectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-premium" dir="rtl">
          <div className="w-full max-w-lg bg-surface border border-border rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Compass size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-ink">مرکز راهنمای تعاملی سامانه اخوان</h3>
                  <p className="text-xs text-ink-soft">آموزش گام‌به‌گام ۲۴ ماژول تخصصی برای {currentRole?.name || 'کاربر'}</p>
                </div>
              </div>

              <button aria-label="بستن"
                type="button"
                onClick={() => setShowSelectorModal(false)}
                className="p-1.5 rounded-xl hover:bg-canvas text-ink-soft cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto no-scrollbar pt-1">
              {getAvailableModules().filter(mod => canUseTour(mod.id)).sort((a, b) => Number(b.id === moduleForPath(location.pathname)) - Number(a.id === moduleForPath(location.pathname))).map(mod => {
                const isCompleted = tourState.completedModules[mod.id];
                const stepsCount = getStepsForModuleAndRole(mod.id, currentRole?.name).length;
                if (stepsCount === 0) return null;

                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => startTour(mod.id)}
                    className="p-3.5 rounded-2xl border border-border/80 bg-canvas/70 hover:bg-surface hover:border-primary/40 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between gap-2 text-start"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <strong className="text-xs font-bold text-ink block truncate">{mod.label}{mod.id === moduleForPath(location.pathname) && <span className="ms-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-nano font-black text-primary">این صفحه</span>}</strong>
                      <span className="text-micro text-ink-soft font-mono">
                        {stepsCount.toLocaleString('fa-IR')} گام آموزشی
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCompleted && (
                        <span className="text-micro text-emerald-600 font-bold flex items-center gap-0.5">
                          <CheckCircle2 size={12} /> تکمیل شده
                        </span>
                      )}
                      <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <Play size={12} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <button
                type="button"
                onClick={resetAllTours}
                className="text-xs text-ink-soft hover:text-danger flex items-center gap-1 transition cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>ریست وضعیت آموزش‌ها</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSelectorModal(false);
                  setShowWhatsNewModal(true);
                }}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles size={13} />
                <span>مشاهده امکانات جدید</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showWhatsNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-premium" dir="rtl">
          <div className="w-full max-w-lg bg-surface border border-border rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-ink">قابلیت‌های جدید سامانه</h3>
                  <p className="text-xs text-ink-soft">آخرین امکانات و ارتقای استانداردهای عملیاتی سامانه اخوان</p>
                </div>
              </div>

              <button aria-label="بستن"
                type="button"
                onClick={() => setShowWhatsNewModal(false)}
                className="p-1.5 rounded-xl hover:bg-canvas text-ink-soft cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto no-scrollbar pt-1">
              {WHATS_NEW_ITEMS.filter(item => canUseTour(item.module)).map(item => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl border border-border/80 bg-canvas/60 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs font-bold text-ink">{item.title}</strong>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-nano font-black font-mono border",
                      item.tag === 'NEW' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      item.tag === 'IMPROVED' ? "bg-blue-50 text-blue-700 border-blue-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    )}>
                      {item.tag === 'NEW' ? 'جدید' : item.tag === 'IMPROVED' ? 'بهبودیافته' : 'امنیتی'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowWhatsNewModal(false)}
                className="py-2 px-5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function triggerTour(module: string = 'global') {
  window.dispatchEvent(new CustomEvent('open-akhavan-tour', { detail: { module } }));
}

export function triggerTourMenu() {
  window.dispatchEvent(new CustomEvent('open-akhavan-tour-menu'));
}

export function triggerWhatsNew() {
  window.dispatchEvent(new CustomEvent('open-akhavan-whats-new'));
}
