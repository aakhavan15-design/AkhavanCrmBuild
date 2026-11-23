import { useNavigate } from 'react-router-dom';
import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, LockKeyhole, Sparkles, Volume2, VolumeX, ShieldCheck, UserCheck, KeyRound, ArrowDownLeft } from 'lucide-react';
import { AuthService } from '../services/AuthService';
import { useAppStore } from '../lib/storage';
import { AnimatedLamp3D } from './auth/AnimatedLamp3D';
import { AkhavanLuxuryLogo } from './auth/AkhavanLuxuryLogo';
import { AuthLightRoad } from './auth/AuthLightRoad';
import { playCinematicLoginGreeting, unlockAudioAndSpeech } from '../lib/cinematicVoiceGreeting';
import type { AppState, UserAccount } from '../types';
import { track, AnalyticsEvents } from '../lib/analytics';

interface LoginWorkspaceProps {
  onAuthenticated?: (user: UserAccount) => void;
  tenantName?: string;
  logoUrl?: string;
  applyEnabled?: boolean;
  state?: AppState;
}

export function LoginWorkspace({
  onAuthenticated,
  tenantName,
  applyEnabled = true,
  state
}: LoginWorkspaceProps) {
  const navigate = useNavigate();
  const updateState = useAppStore(s => s.updateState);

  // فرم ورود اطلاعات
  const [tenantCode, setTenantCode] = useState('AKHAVAN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // وضعیت روشنایی آباژور و صدا (شروع با چراغ خاموش طبق درخواست)
  const [isLightOn, setIsLightOn] = useState(false);
  // Keep the form mounted briefly while the lamp fades out; never unmount mid-transition.
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  useEffect(() => {
    if (isLightOn) {
      setShowLoginPanel(true);
      return;
    }
    const fadeOut = window.setTimeout(() => setShowLoginPanel(false), 480);
    return () => window.clearTimeout(fadeOut);
  }, [isLightOn]);

  const [soundEnabled, setSoundEnabled] = useState(true);

  // تب فعال در کارت ورود: فرم ورود مستقیم یا انتخاب حساب پیش‌فرض
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'DEMO_INFO'>('LOGIN');

  // انیمیشن ترنزیشن ورود به سامانه
  const [warpActive, setWarpActive] = useState(false);
  const [warpStatusText, setWarpStatusText] = useState('');
  const timers = useRef<number[]>([]);

  useEffect(() => () => {
    timers.current.forEach(window.clearTimeout);
  }, []);

  const toggleSound = () => {
    unlockAudioAndSpeech();
    setSoundEnabled(prev => !prev);
  };

  const handleLampToggle = (newState: boolean) => {
    unlockAudioAndSpeech();
    setIsLightOn(newState);
  };

  const applyAccount = (user: string, pass: string) => {
    unlockAudioAndSpeech();
    setUsername(user);
    setPassword(pass);
    setActiveTab('LOGIN');
    setStatus('');
    if (!isLightOn) {
      setIsLightOn(true);
    }
  };

  const startWarpFlythrough = (done: () => void) => {
    setWarpActive(true);
    setStatus('');
    setWarpStatusText('در حال احراز هویت و بارگذاری سامانه اخوان...');

    // Phase 2: Cinematic AI Robotic Voice Greeting (plays strictly once after successful authentication)
    playCinematicLoginGreeting(soundEnabled).catch(err => {
      console.warn('[AKHAVAN Audio] Non-fatal greeting error in workspace:', err);
    });

    const sequence = [
      { text: 'بررسی دسترسی‌های سازمانی و نقش کاربری...', delay: 450 },
      { text: 'بارگذاری زنجیره توزیع و ماژول‌های سامانه اخوان...', delay: 950 },
      { text: 'ورود موفقیت‌آمیز به فضای کاری...', delay: 1550 },
    ];

    sequence.forEach(item => {
      timers.current.push(
        window.setTimeout(() => {
          setWarpStatusText(item.text);
        }, item.delay)
      );
    });

    timers.current.push(
      window.setTimeout(() => {
        done();
      }, 2100)
    );
  };

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Unlock Web Audio & SpeechSynthesis synchronously inside the direct user-gesture event
    unlockAudioAndSpeech();
    setStatus('');

    if (!isLightOn) {
      setStatus('ابتدا با کشیدن نخ آباژور، چراغ را روشن کنید!');
      return;
    }

    if (!tenantCode.trim() || !username.trim() || !password) {
      setStatus('شناسه سازمان، نام کاربری و گذرواژه را وارد کنید.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await AuthService.authenticate({ tenantCode, username, password }, state);

      if (result.status === 'AUTHENTICATED') {
        updateState(draft => {
          draft.currentUserId = result.user.id;
          draft.users = [...(draft.users || []).filter(user => user.id !== result.user.id), result.user];
          draft.roles = [...(draft.roles || []).filter(role => role.id !== result.role.id), result.role];
          draft.permissionSets = [...(draft.permissionSets || []).filter(set => set.id !== result.permissionSet.id), result.permissionSet];
        });
        track(AnalyticsEvents.LOGIN_SUCCESS);
        startWarpFlythrough(() => onAuthenticated?.(result.user));
        return;
      }

      const messages: Record<string, string> = {
        INVALID_CREDENTIALS: 'نام کاربری یا گذرواژه صحیح نیست. (راهنما: در تب حساب‌ها، نام کاربری پیش‌فرض را انتخاب کنید)',
        NOT_CONFIGURED: 'سرویس ورود یا پایگاه داده آماده نیست. با مدیر سامانه تماس بگیرید.',
        ROLE_NOT_ASSIGNED: 'برای حساب شما در سامانه اصلی نقش فعال تعریف نشده است. مدیر سامانه باید نقش و مجوزها را تخصیص دهد.',
        NETWORK_ERROR: 'ارتباط با سرویس احراز هویت برقرار نشد. لطفاً اتصال سرور را بررسی کنید.'
      };
      setStatus(messages[result.status] || 'ورود انجام نشد.');
    } catch {
      setStatus('خطایی در فرایند ورود رخ داد.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className="fixed inset-0 h-dvh max-h-dvh w-full overflow-hidden select-none flex flex-col justify-between text-(--c-auth-on-ambient)"
      dir="rtl"
      style={{
        backgroundColor: 'black',
        backgroundImage: isLightOn
          ? 'radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--c-primary) 22%, transparent) 0%, color-mix(in srgb, var(--c-forest-dark) 20%, var(--c-auth-ambient)) 40%, var(--c-auth-ambient) 80%)'
          : 'radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--c-copper) 5%, var(--c-auth-ambient)) 0%, var(--c-auth-ambient) 65%)',
        transition: 'background-color 1.1s ease, background-image 1.1s ease',
      }}
    >
      {/* ================= پس‌زمینه سینمایی اتاق تاریک لوکس ================= */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <AuthLightRoad isLightOn={isLightOn} />
        {/* پنجره تاریک در دیوار سمت چپ پشت آباژور با نور مه‌آلود */}
        {isLightOn && (
          <div
            className="absolute top-10 left-6 sm:top-14 sm:left-14 w-24 sm:w-36 h-36 sm:h-52 rounded-lg border border-(--c-auth-on-ambient)/5 opacity-20 flex flex-col transition-opacity duration-700"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--c-cobalt) 8%, transparent) 0%, transparent 85%)',
            }}
          >
            <div className="flex-1 flex border-b border-(--c-auth-on-ambient)/5">
              <div className="flex-1 border-r border-(--c-auth-on-ambient)/5" />
              <div className="flex-1" />
            </div>
            <div className="flex-1 flex">
              <div className="flex-1 border-r border-(--c-auth-on-ambient)/5" />
              <div className="flex-1" />
            </div>
          </div>
        )}

        {/* خط بازتاب نور لبه میز در تاریکی هماهنگ با Indigo (فقط در حالت روشن) */}
        {isLightOn && (
          <div
            className="absolute bottom-10 left-0 right-0 h-px transition-opacity duration-700"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--c-copper) 22%, transparent) 20%, color-mix(in srgb, var(--c-cobalt) 38%, transparent) 50%, color-mix(in srgb, var(--c-copper) 22%, transparent) 80%, transparent 100%)',
            }}
          />
        )}
      </div>

      {/* ================= بخش ۴: نوار هدر فوق‌العاده مینیمال و شیشه‌ای ================= */}
      <header className="relative z-30 shrink-0 h-14 w-full px-4 sm:px-8 flex items-center justify-between border-b border-(--c-auth-on-ambient)/5 bg-(--c-auth-ambient)/40 backdrop-blur-2xl">
        {/* برند اخوان */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center p-1.5 border border-(--c-auth-on-ambient)/10 shadow-lg overflow-hidden bg-(--c-auth-on-ambient)/5"
            style={{
              boxShadow: isLightOn
                ? '0 0 20px color-mix(in srgb, var(--c-primary) 35%, transparent)'
                : 'none',
            }}
          >
            <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
              <defs>
                <linearGradient id="crestGoldGradHeader" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--c-warning-soft)" />
                  <stop offset="50%" stopColor="var(--c-accent)" />
                  <stop offset="100%" stopColor="var(--c-copper)" />
                </linearGradient>
              </defs>
              <polygon points="20,4 36,13 36,27 20,36 4,27 4,13" stroke="url(#crestGoldGradHeader)" strokeWidth="1.2" opacity="0.8" />
              <path d="M 12,27 C 14,18 20,8 20,8 C 20,8 26,18 28,27" stroke="url(#crestGoldGradHeader)" strokeWidth="2" strokeLinecap="round" />
              <path d="M 9,21 Q 20,18 31,19" stroke="url(#crestGoldGradHeader)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>

          <div className="flex flex-col">
            <span className="font-bold text-xs sm:text-sm text-(--c-auth-on-ambient) tracking-tight leading-tight">
              {tenantName || 'گروه صنعتی اخوان'}
            </span>
            <span className="text-nano tracking-widest font-mono text-(--c-auth-on-ambient)/50 uppercase">
              ENTERPRISE PLATFORM
            </span>
          </div>
        </div>

        {/* دکمه‌های کنترل محیطی (صدا و روشنایی) */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl border border-(--c-auth-on-ambient)/10 backdrop-blur-xl bg-(--c-auth-on-ambient)/5">
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundEnabled ? 'قطع صدا' : 'فعال‌سازی صدا'}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-(--c-auth-on-ambient)/10 text-(--c-auth-on-ambient) text-xs font-medium transition-colors cursor-pointer"
          >
            {soundEnabled ? (
              <>
                <Volume2 size={14} className="text-amber-300" />
                <span className="hidden sm:inline text-(--c-auth-on-ambient)/80">صدا</span>
              </>
            ) : (
              <>
                <VolumeX size={14} className="text-(--c-auth-on-ambient)/40" />
                <span className="hidden sm:inline text-(--c-auth-on-ambient)/40">بی‌صدا</span>
              </>
            )}
          </button>

          <div className="w-px h-3.5 bg-(--c-auth-on-ambient)/10" />

          <button
            type="button"
            onClick={() => handleLampToggle(!isLightOn)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isLightOn
                ? 'bg-emerald-950/70 text-emerald-200 border border-emerald-500/40 shadow-sm'
                : 'text-(--c-auth-on-ambient)/70 hover:text-(--c-auth-on-ambient)'
            }`}
          >
            <span>{isLightOn ? 'فضا روشن' : 'فضا خاموش'}</span>
          </button>
        </div>
      </header>

      {/* ================= صحنه مرکزی: طراحی متقارن و ارگونومیک کلاس جهانی بدون هرگونه اسکرول ================= */}
      <div className="relative z-20 flex-1 min-h-0 w-full max-w-5xl mx-auto px-2 xs:px-3 sm:px-6 flex flex-row items-center justify-center gap-2 xs:gap-3 sm:gap-6 md:gap-12 overflow-hidden">
        {/* هاله نور پس‌زمینه */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${isLightOn ? 'opacity-100' : 'opacity-0'}`}
          style={{
            background: 'radial-gradient(circle at 65% 45%, color-mix(in srgb, var(--c-primary) 18%, transparent) 0%, transparent 60%)',
            filter: 'blur(40px)',
          }}
        />

        {/* المان آباژور مدرن در سمت راست */}
        <div className="shrink-0 flex flex-col items-center justify-center">
          <AnimatedLamp3D
            isLightOn={isLightOn}
            onToggle={handleLampToggle}
            soundEnabled={soundEnabled}
            className="transform transition-transform duration-500"
          />
        </div>

        {/* المان کارت ورود و هویت بصری لوکس در سمت چپ */}
        <div className="w-full max-w-(--size-260) xs:max-w-(--size-290) sm:max-w-(--size-380) md:max-w-(--size-430) shrink flex flex-col justify-center">
          
          {/* لوگوی رسمی AKHAVAN GROUP */}
          <div className="relative mb-2 sm:mb-3 flex flex-col items-center">
            <div className="relative w-full flex justify-center transition-transform duration-500 hover:scale-(--scale-lift-subtle)">
              <AkhavanLuxuryLogo isLightOn={isLightOn} className="w-(--size-160) xs:w-(--size-190) sm:w-(--size-250) md:w-(--size-300)" />
            </div>

            {/* خط باریک پرتو طلایی-یشمی زیر لوگو */}
            <div
              className="mt-1.5 h-px rounded-full transition-all duration-700 self-center"
              style={{
                width: isLightOn ? '100%' : '55%',
                maxWidth: 'var(--size-220)',
                background: isLightOn
                  ? 'linear-gradient(90deg, transparent 0%, var(--c-copper) 30%, var(--c-cobalt) 70%, transparent 100%)'
                  : 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--c-copper) 40%, transparent) 50%, transparent 100%)',
                boxShadow: isLightOn ? '0 0 12px color-mix(in srgb, var(--c-cobalt) 40%, transparent)' : 'none',
              }}
            />
          </div>

          {/* ================= نمایش فرم در حالت روشن یا درگاه تاریک در حالت خاموش ================= */}
          {showLoginPanel ? (
            /* فرم ورود گلسمورفیسم فوق‌العاده باکیفیت و شفاف هماهنگ با Indigo */
            <div
              key="auth-card-lit"
              className="relative w-full rounded-2xl border border-(--c-auth-on-ambient)/10 p-2.5 xs:p-3 sm:p-5 backdrop-blur-2xl overflow-hidden transition-all duration-500"
              style={{
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--c-navy-dark) 85%, var(--c-auth-ambient)) 0%, var(--c-auth-ambient) 100%)',
                borderTop: '1px solid color-mix(in srgb, var(--c-copper) 45%, transparent)',
                boxShadow: '0 20px 45px color-mix(in srgb, var(--c-auth-ambient) 90%, transparent), 0 0 30px color-mix(in srgb, var(--c-cobalt) 22%, transparent)',
                animation: isLightOn ? 'lampRayCinematicReveal 1.05s cubic-bezier(0.16, 1, 0.3, 1) both' : 'lampCardFadeOut 480ms ease-in both',
                pointerEvents: isLightOn ? 'auto' : 'none',
              }}
            >
              {/* هاله نور پرتو طلایی-یشمی جاروب‌کننده روی کارت هنگام پدیدار شدن */}
              <div
                className="absolute inset-0 pointer-events-none z-20 rounded-2xl"
                style={{
                  background: 'linear-gradient(105deg, color-mix(in srgb, var(--c-copper-soft) 35%, transparent) 0%, color-mix(in srgb, var(--c-cobalt) 25%, transparent) 40%, transparent 80%)',
                  animation: 'lampLightSweep 0.95s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                }}
              />
              {/* تب‌های بالای کارت کاملاً محصور در کادر بدون هیچ‌گونه بیرون‌زدگی */}
              <div className="flex flex-col xs:flex-row xs:items-center justify-between pb-2 sm:pb-2.5 border-b border-(--c-auth-on-ambient)/10 gap-1.5 sm:gap-2">
                <span className="text-caption sm:text-compact font-bold text-(--c-auth-on-ambient) tracking-wide">
                  ورود به حساب کاربری
                </span>

                {import.meta.env.DEV && (                <div className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg border border-(--c-auth-on-ambient)/15 bg-(--c-auth-on-ambient)/5 backdrop-blur-md self-start xs:self-auto shrink-0 max-w-full">
                  <button
                    type="button"
                    onClick={() => setActiveTab('LOGIN')}
                    className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-micro sm:text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'LOGIN'
                        ? 'bg-primary-dark text-warning border border-warning/50 shadow-md'
                        : 'text-(--c-auth-on-ambient)/75 hover:text-(--c-auth-on-ambient) hover:bg-(--c-auth-on-ambient)/10'
                    }`}
                  >
                    فرم ورود
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('DEMO_INFO')}
                    className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-micro sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                      activeTab === 'DEMO_INFO'
                        ? 'bg-primary-dark text-warning border border-warning/50 shadow-md'
                        : 'text-(--c-auth-on-ambient)/75 hover:text-(--c-auth-on-ambient) hover:bg-(--c-auth-on-ambient)/10'
                    }`}
                  >
                    <KeyRound size={11} className={activeTab === 'DEMO_INFO' ? 'text-warning' : 'text-(--c-auth-on-ambient)/75'} />
                    <span>حساب‌ها</span>
                  </button>
                </div>
                )}
              </div>

              {/* تب ۱: فرم ورود */}
              {activeTab === 'LOGIN' && (
                <form onSubmit={submit} className="mt-2 space-y-1.5 sm:space-y-2.5">
                  <div className="space-y-0.5 sm:space-y-1">
                    <label htmlFor="auth-tenant" className="block text-mini sm:text-xs font-semibold text-slate-200">
                      شناسه سازمان
                    </label>
                    <input
                      id="auth-tenant"
                      type="text"
                      autoComplete="organization"
                      value={tenantCode}
                      onChange={e => setTenantCode(e.target.value)}
                      placeholder="نام سازمان"
                      className="w-full h-8.5 xs:h-9 sm:h-10.5 px-2.5 sm:px-3.5 rounded-lg sm:rounded-xl border border-(--c-auth-on-ambient)/15 text-xs sm:text-sm text-(--c-auth-on-ambient) placeholder-slate-500 font-mono transition-all duration-200 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
                      style={{ background: 'color-mix(in srgb, var(--c-auth-ambient) 85%, var(--c-navy-dark))' }}
                      disabled={warpActive || isSubmitting}
                    />
                  </div>

                  <div className="space-y-0.5 sm:space-y-1">
                    <label htmlFor="auth-username" className="block text-mini sm:text-xs font-semibold text-slate-200">
                      نام کاربری
                    </label>
                    <input
                      id="auth-username"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="مثال: a.akhavan"
                      className="w-full h-8.5 xs:h-9 sm:h-10.5 px-2.5 sm:px-3.5 rounded-lg sm:rounded-xl border border-(--c-auth-on-ambient)/15 text-xs sm:text-sm text-(--c-auth-on-ambient) placeholder-slate-500 font-mono text-left transition-all duration-200 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
                      style={{ background: 'color-mix(in srgb, var(--c-auth-ambient) 85%, var(--c-navy-dark))' }}
                      dir="ltr"
                      disabled={warpActive || isSubmitting}
                    />
                  </div>

                  <div className="space-y-0.5 sm:space-y-1">
                    <label htmlFor="auth-password" className="block text-mini sm:text-xs font-semibold text-slate-200">
                      گذرواژه
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="رمز عبور"
                        className="w-full h-8.5 xs:h-9 sm:h-10.5 pr-2.5 sm:pr-3.5 pl-8 sm:pl-10 rounded-lg sm:rounded-xl border border-(--c-auth-on-ambient)/15 text-xs sm:text-sm text-(--c-auth-on-ambient) placeholder-slate-500 font-mono text-left transition-all duration-200 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
                        style={{ background: 'color-mix(in srgb, var(--c-auth-ambient) 85%, var(--c-navy-dark))' }}
                        dir="ltr"
                        disabled={warpActive || isSubmitting}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute left-1.5 sm:left-2 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-(--c-auth-on-ambient)/70 hover:text-(--c-auth-on-ambient) transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  {status && (
                    <div className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-rose-500/40 bg-rose-500/20 text-rose-200 text-caption sm:text-xs leading-snug">
                      {status}
                    </div>
                  )}

                  <button
                    type="submit"
                    onClick={() => unlockAudioAndSpeech()}
                    disabled={warpActive || isSubmitting}
                    className="w-full h-9.5 xs:h-10 sm:h-12 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 shadow-xl transition-all duration-200 cursor-pointer disabled:opacity-50 text-(--c-auth-on-ambient) mt-1 sm:mt-2 hover:scale-(--scale-lift-subtle) active:scale-(--scale-press-subtle)"
                    style={{
                      background: 'linear-gradient(135deg, var(--c-cobalt) 0%, var(--c-cobalt-dark) 100%)',
                      border: '1px solid color-mix(in srgb, var(--c-copper) 45%, transparent)',
                      boxShadow: '0 4px 20px color-mix(in srgb, var(--c-cobalt) 40%, transparent), 0 0 10px color-mix(in srgb, var(--c-copper) 30%, transparent)',
                    }}
                  >
                    <LockKeyhole size={14} />
                    <span>{isSubmitting ? 'در حال بررسی...' : warpActive ? 'در حال ورود…' : 'ورود به سامانه اخوان'}</span>
                  </button>
                </form>
              )}

              {/* تب ۲: اطلاعات حساب‌های پیش‌فرض */}
              {import.meta.env.DEV && activeTab === 'DEMO_INFO' && (
                <div className="mt-2 space-y-1.5">
                  <div className="space-y-1">
                    <div
                      onClick={() => applyAccount('a.akhavan', '123456')}
                      className="p-1.5 sm:p-2 rounded-lg border border-(--c-auth-on-ambient)/10 hover:border-warning transition-all cursor-pointer group flex items-center justify-between"
                      style={{ background: 'color-mix(in srgb, var(--c-auth-ambient) 85%, var(--c-navy-dark))' }}
                    >
                      <div className="flex items-center gap-1.5">
                        <UserCheck size={13} className="text-warning shrink-0" />
                        <div>
                          <b className="text-mini sm:text-caption text-(--c-auth-on-ambient) block group-hover:text-warning leading-tight">علی اخوان (مدیر ارشد)</b>
                          <span className="text-tiny text-(--c-auth-on-ambient)/70 font-mono">a.akhavan · 123456</span>
                        </div>
                      </div>
                      <span className="text-tiny text-warning font-bold bg-primary-dark px-1.5 py-0.5 rounded border border-warning/40">انتخاب</span>
                    </div>

                    <div
                      onClick={() => applyAccount('s.rezaei', '123456')}
                      className="p-1.5 sm:p-2 rounded-lg border border-(--c-auth-on-ambient)/10 hover:border-warning transition-all cursor-pointer group flex items-center justify-between"
                      style={{ background: 'color-mix(in srgb, var(--c-auth-ambient) 85%, var(--c-navy-dark))' }}
                    >
                      <div className="flex items-center gap-1.5">
                        <UserCheck size={13} className="text-success shrink-0" />
                        <div>
                          <b className="text-mini sm:text-caption text-(--c-auth-on-ambient) block group-hover:text-success leading-tight">سارا رضایی (مدیر فروش)</b>
                          <span className="text-tiny text-(--c-auth-on-ambient)/70 font-mono">s.rezaei · 123456</span>
                        </div>
                      </div>
                      <span className="text-tiny text-warning font-bold bg-primary-dark px-1.5 py-0.5 rounded border border-warning/40">انتخاب</span>
                    </div>

                    <div
                      onClick={() => applyAccount('r.kamali', '123456')}
                      className="p-1.5 sm:p-2 rounded-lg border border-(--c-auth-on-ambient)/10 hover:border-warning transition-all cursor-pointer group flex items-center justify-between"
                      style={{ background: 'color-mix(in srgb, var(--c-auth-ambient) 85%, var(--c-navy-dark))' }}
                    >
                      <div className="flex items-center gap-1.5">
                        <UserCheck size={13} className="text-warning shrink-0" />
                        <div>
                          <b className="text-mini sm:text-caption text-(--c-auth-on-ambient) block group-hover:text-warning leading-tight">رضا کمالی (مدیر مالی)</b>
                          <span className="text-tiny text-(--c-auth-on-ambient)/70 font-mono">r.kamali · 123456</span>
                        </div>
                      </div>
                      <span className="text-tiny text-warning font-bold bg-primary-dark px-1.5 py-0.5 rounded border border-warning/40">انتخاب</span>
                    </div>
                  </div>
                </div>
              )}

              {/* لینک ثبت‌نام پرسنل */}
              {applyEnabled && (
                <div className="mt-2 pt-1.5 border-t border-(--c-auth-on-ambient)/10 text-center">
                  <button
                    type="button"
                    onClick={() => navigate('/apply')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro sm:text-caption font-bold text-emerald-300 hover:text-(--c-auth-on-ambient) hover:bg-emerald-500/15 transition-all cursor-pointer border border-emerald-400/25 hover:border-emerald-400/50 shadow-sm"
                  >
                    <span>فرم استخدام پرسنل جدید</span>
                    <span aria-hidden="true">←</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ================= درگاه تاریک مینیمال و اشرافی در حالت خاموش ================= */
            <div
              key="auth-card-hint"
              onClick={() => handleLampToggle(true)}
              className="relative overflow-hidden w-full rounded-2xl sm:rounded-3xl border border-(--c-auth-on-ambient)/10 hover:border-amber-400/40 p-5 sm:p-7 backdrop-blur-2xl text-center cursor-pointer group transition-all duration-500 flex flex-col items-center justify-center gap-4"
              style={{
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--c-navy-dark) 92%, var(--c-auth-ambient)) 0%, var(--c-auth-ambient) 100%)',
                borderTop: '1px solid color-mix(in srgb, var(--c-copper) 45%, transparent)',
                boxShadow: '0 25px 50px color-mix(in srgb, var(--c-auth-ambient) 95%, transparent)',
                animation: 'luxuryCardCinematicEntrance 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
              title="برای ورود، نخ آباژور را به پایین بکشید یا اینجا کلیک کنید"
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleLampToggle(true); }}
            >
              {/* ذرات آرام طلایی شناور در پس‌زمینه */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 rounded-2xl sm:rounded-3xl opacity-60">
                {Array.from({ length: 12 }).map((_, i) => {
                  const left = (i * 8.3 + 4) % 94;
                  const duration = 6 + (i % 4) * 1.5;
                  const delay = (i * 0.5) % 3;
                  const size = 2.5 + (i % 3) * 1.2;
                  return (
                    <span
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: `${left}%`,
                        top: '-10px',
                        width: `${size}px`,
                        height: `${size}px`,
                        background: 'radial-gradient(circle, var(--c-copper-soft) 0%, var(--c-accent) 80%, transparent 100%)',
                        boxShadow: '0 0 6px color-mix(in srgb, var(--c-copper) 60%, transparent)',
                        animation: `goldRain ${duration}s linear infinite`,
                        animationDelay: `${delay}s`,
                      }}
                    />
                  );
                })}
              </div>

              {/* نشان درگاه سازمانی */}
              <div className="relative z-10 flex flex-col items-center gap-1.5">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center border border-amber-400/25 transition-transform duration-500 group-hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--c-navy-dark) 80%, var(--c-auth-ambient)) 0%, var(--c-auth-ambient) 100%)',
                    boxShadow: '0 4px 16px color-mix(in srgb, var(--c-auth-ambient) 80%, transparent)',
                  }}
                >
                  <LockKeyhole size={18} className="text-amber-300/80 transition-colors group-hover:text-amber-200" />
                </div>
                <span className="text-caption font-mono tracking-widest text-amber-200/60 uppercase">
                  ENTERPRISE PORTAL
                </span>
              </div>

              {/* متن دعوت اشرافی و کوتاه */}
              <div className="relative z-10 space-y-1.5 max-w-xs">
                <h2 className="text-sm sm:text-base font-bold text-(--c-auth-on-ambient) tracking-wide">
                  ورود به درگاه هوشمند سازمانی
                </h2>
                <p className="text-xs text-(--c-auth-on-ambient)/55 leading-relaxed font-sans">
                  برای روشن‌شدن فضا و دسترسی به سامانه، نخ آباژور را به پایین بکشید یا اینجا ضربه بزنید.
                </p>
              </div>

              {/* کلید لمسی ظریف با بازخورد نوری */}
              <div
                className="relative z-10 mt-1 px-4 py-2 rounded-xl border border-amber-400/30 text-amber-200 text-xs font-medium flex items-center gap-2 group-hover:border-amber-400/60 group-hover:text-amber-100 transition-all duration-300"
                style={{
                  background: 'color-mix(in srgb, var(--c-navy-dark) 60%, var(--c-auth-ambient))',
                  boxShadow: '0 2px 10px color-mix(in srgb, var(--c-auth-ambient) 60%, transparent)',
                }}
              >
                <ArrowDownLeft size={14} className="text-amber-300 transition-transform duration-300 group-hover:-translate-x-0.5 group-hover:translate-y-0.5" />
                <span>کلیک کنید یا نخ آباژور را بکشید</span>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* ================= بخش ۳: فوتر مینیمال با متن دقیق ================= */}
      <footer className="relative z-20 shrink-0 py-2 sm:py-2.5 w-full px-4 border-t border-(--c-auth-on-ambient)/5 bg-(--c-auth-ambient)/80 backdrop-blur-md text-center flex flex-col items-center justify-center gap-0.5 select-none">
        <span className="font-bold text-mini sm:text-small tracking-[0.26em] text-(--c-auth-on-ambient)/90 font-sans uppercase">
          AKHAVAN GROUP
        </span>
        <span className="text-pico sm:text-tiny tracking-[0.22em] text-(--c-auth-on-ambient)/60 font-mono uppercase">
          INTELLIGENCE IN EVERY CONNECTION · EXCELLENCE IN EVERY DECISION
        </span>
      </footer>

      {/* مودال ترنزیشن هنگام ورود */}
      {warpActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--c-auth-ambient)/90 backdrop-blur-xl" aria-live="assertive">
          <div className="p-6 rounded-2xl border border-warning/40 bg-(--c-auth-ambient) max-w-xs w-full text-center shadow-2xl space-y-3">
            <div
              className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-warning-soft font-black text-lg animate-pulse border border-warning/50"
              style={{
                background: 'linear-gradient(135deg, var(--c-forest-dark) 0%, var(--c-auth-ambient) 100%)',
              }}
            >
              A
            </div>
            <strong className="block text-xs text-warning font-bold">{warpStatusText}</strong>
            <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full animate-pulse"
                style={{
                  width: '85%',
                  background: 'linear-gradient(90deg, var(--c-copper) 0%, var(--c-cobalt) 100%)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes lampCardFadeOut {
          from { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
          to { opacity: 0; filter: blur(7px); transform: translateY(12px) scale(0.97); }
        }

        @keyframes lampRayCinematicReveal {
          0% {
            opacity: 0;
            transform: perspective(900px) translateX(-34px) translateY(12px) rotateY(-4deg) scale(0.94);
            filter: blur(18px);
            box-shadow: -30px 0 60px color-mix(in srgb, var(--c-copper) 50%, transparent), 0 0 0 transparent;
          }
          35% {
            opacity: 0.65;
            filter: blur(8px);
            box-shadow: -15px 0 45px color-mix(in srgb, var(--c-copper) 35%, transparent);
          }
          70% {
            opacity: 0.94;
            transform: perspective(900px) translateX(2px) translateY(-2px) rotateY(1deg) scale(1.008);
            filter: blur(1.5px);
          }
          100% {
            opacity: 1;
            transform: perspective(900px) translateX(0) translateY(0) rotateY(0) scale(1);
            filter: blur(0px);
            box-shadow: 0 20px 45px color-mix(in srgb, var(--c-auth-ambient) 90%, transparent), 0 0 25px color-mix(in srgb, var(--c-cobalt) 20%, transparent);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
        }
        @keyframes lampLightSweep {
          0% {
            opacity: 0.85;
            transform: translateX(-100%);
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 0;
            transform: translateX(100%);
          }
        }

        @keyframes goldRain {
          0% {
            transform: translateY(-20px) scale(0.5);
            opacity: 0;
          }
          20% {
            opacity: 0.85;
          }
          80% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(220px) scale(1.2);
            opacity: 0;
          }
        }
      `}</style>
    </main>
  );
}
