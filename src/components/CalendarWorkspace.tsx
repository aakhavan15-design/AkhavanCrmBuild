import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, Textarea } from './ui';
import { AppState, InternalMeeting, CustomerTask } from '../types';
import { 
  Clock, ArrowLeft, ChevronRight, ChevronLeft, 
  Calendar as CalendarIcon, Users, Plus, AlertTriangle
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useCan } from '../hooks/useCan';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { generateId } from '../lib/utils';
import { getMeetingConflict } from '../lib/internalWorkflow';
import { assignSla } from '../services/taskIntelligence';
import { appendTaskActivity } from '../services/taskActivity';
import { processTaskCollaborationEvents } from '../lib/collaboration';
import { InputControl, Checkbox } from './ui/Input';
import { 
  getJalaliDate, 
  jalaliToGregorianISO, 
  getJalaliMonthDays, 
  JALALI_MONTH_NAMES, 
  toPersianDigits,
  formatAppDate,
  toLocalDateISO
} from '../lib/utils';

export function CalendarWorkspace({ state, updateState }: { state: AppState; updateState: (updater: (draft: AppState) => AppState | void) => void }) {
  const { can, denied } = useCan(state, updateState);
  const navigate = useNavigate();
  const tasks = state.tasks || [];
  const meetings = state.internalMeetings || [];
  const cheques = state.cheques || [];
  
  const isJalali = state.settings?.locale?.calendar !== 'gregorian';
  const todayJalali = getJalaliDate();

  const [currentYear, setCurrentYear] = useState<number>(todayJalali.jy);
  const [currentMonth, setCurrentMonth] = useState<number>(todayJalali.jm);
  const [selectedDay, setSelectedDay] = useState<number | null>(todayJalali.jd);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'TASKS' | 'MEETINGS' | 'CHEQUES'>('ALL');
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<InternalMeeting | null>(null);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(toLocalDateISO());
  const [meetingStart, setMeetingStart] = useState('09:00');
  const [meetingEnd, setMeetingEnd] = useState('09:30');
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingParticipants, setMeetingParticipants] = useState<string[]>([]);
  const [meetingError, setMeetingError] = useState('');
  const meetingSubmitLock = useRef(false);
  const [decisionTaskId, setDecisionTaskId] = useState<string | null>(null);
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionAssignee, setDecisionAssignee] = useState(state.currentUserId || '');
  const [decisionDueDate, setDecisionDueDate] = useState(toLocalDateISO(new Date(Date.now() + 3 * 86400000)));

  useDeepLinkCreate(() => {
    setMeetingError('');
    setNewMeetingOpen(true);
  });

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear(prev => prev - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear(prev => prev + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
    setSelectedDay(null);
  };

  const handleGoToday = () => {
    setCurrentYear(todayJalali.jy);
    setCurrentMonth(todayJalali.jm);
    setSelectedDay(todayJalali.jd);
  };

  const daysInMonth = getJalaliMonthDays(currentYear, currentMonth);
  const monthName = JALALI_MONTH_NAMES[currentMonth - 1] || '';
  const monthYearDisplay = `${monthName} ${toPersianDigits(currentYear)}`;

  const firstDayGDate = new Date(jalaliToGregorianISO(currentYear, currentMonth, 1));
  const gDay = firstDayGDate.getDay();
  const startOffset = (gDay + 1) % 7;

  const weekDays = ['شنبه', '۱شنبه', '۲شنبه', '۳شنبه', '۴شنبه', '۵شنبه', 'جمعه'];
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const itemsForDay = (day: number) => {
    const dayISO = jalaliToGregorianISO(currentYear, currentMonth, day);
    const dayTasks = tasks.filter(t => t.dueDate === dayISO);
    const dayMeetings = meetings.filter((m: Record<string, unknown>) => m.date === dayISO || (!m.date && day === todayJalali.jd && currentMonth === todayJalali.jm));
    const dayCheques = cheques.filter(c => c.dueDate === dayISO);

    return {
      tasks: dayTasks,
      meetings: dayMeetings,
      cheques: dayCheques,
      count: dayTasks.length + dayMeetings.length + dayCheques.length,
      iso: dayISO
    };
  };

  const activeDayData = selectedDay ? itemsForDay(selectedDay) : itemsForDay(todayJalali.jd);

  const handleCreateMeeting = () => {
    if (meetingSubmitLock.current) return;
    if (!can('calendar', 'CREATE')) return denied('ثبت جلسه سازمانی');
    const title = meetingTitle.trim();
    if (!title) { setMeetingError('عنوان جلسه الزامی است.'); return; }
    const organizerId = state.currentUserId || '';
    if (!organizerId) { setMeetingError('کاربر فعال معتبر نیست.'); return; }
    const candidate = { date: meetingDate, startTime: meetingStart, endTime: meetingEnd, organizerId, participantIds: meetingParticipants };
    const conflict = getMeetingConflict((state.internalMeetings || []) as InternalMeeting[], candidate);
    if (conflict) { setMeetingError(conflict); return; }
    meetingSubmitLock.current = true;
    const at = new Date().toISOString();
    const meeting: InternalMeeting = {
      id: generateId(), title, date: meetingDate, startTime: meetingStart, endTime: meetingEnd,
      organizerId, participantIds: [...new Set([organizerId, ...meetingParticipants])], agenda: meetingAgenda.trim(),
      location: meetingLocation.trim(), status: 'SCHEDULED', createdAt: at, updatedAt: at, actionItems: []
    };
    updateState(draft => {
      if (!draft.internalMeetings) draft.internalMeetings = [];
      if (draft.internalMeetings.some((item: Record<string, unknown>) => item.id === meeting.id)) return;
      draft.internalMeetings.push(meeting);
      if (!draft.notifications) draft.notifications = [];
      meeting.participantIds?.filter(id => id !== organizerId).forEach(recipientId => draft.notifications!.push({
        id: generateId(), title: `دعوت به جلسه: ${meeting.title}`,
        message: `جلسه در تاریخ ${meeting.date} از ساعت ${meeting.startTime} تا ${meeting.endTime} برنامه‌ریزی شد.`,
        type: 'INFO', read: false, createdAt: at, linkTab: 'calendar', recipientId
      }));
    });
    setNewMeetingOpen(false); setMeetingTitle(''); setMeetingAgenda(''); setMeetingLocation(''); setMeetingParticipants([]); setMeetingError('');
    meetingSubmitLock.current = false;
  };

  const handleCreateDecisionTask = () => {
    if (!selectedMeeting || !decisionTitle.trim()) return;
    if (!can('tasks', 'CREATE')) return denied('ایجاد وظیفه از مصوبه جلسه');
    if (!decisionAssignee) { setMeetingError('مسئول پیگیری را انتخاب کنید.'); return; }
    if (decisionAssignee !== state.currentUserId && !can('tasks', 'ASSIGN')) return denied('ارجاع وظیفه به همکار');
    const at = new Date().toISOString();
    const task = appendTaskActivity(assignSla({
      id: decisionTaskId || generateId(), title: decisionTitle.trim(),
      description: `مصوبه جلسه «${selectedMeeting.title}» در تاریخ ${selectedMeeting.date}`,
      dueDate: decisionDueDate, targetDate: decisionDueDate, priority: 'HIGH', status: 'OPEN',
      assigneeType: 'USER', assigneeId: decisionAssignee, ownerId: state.currentUserId || '',
      sourceMeetingId: selectedMeeting.id, createdAt: at
    }), { action: 'CREATED', actorId: state.currentUserId || 'UNKNOWN', at, summary: 'وظیفه از مصوبه جلسه ایجاد شد', details: `جلسه: ${selectedMeeting.title}` });
    updateState(draft => {
      const meeting = (draft.internalMeetings || []).find((item: Record<string, unknown>) => item.id === selectedMeeting.id);
      if (!meeting) return;
      if (!Array.isArray(meeting.actionItems)) meeting.actionItems = [];
      if (meeting.actionItems.some((item: Record<string, unknown>) => item.taskId === task.id)) return;
      meeting.actionItems.push({ id: generateId(), title: decisionTitle.trim(), assigneeId: decisionAssignee, dueDate: decisionDueDate, completed: false, taskId: task.id });
      if (!draft.tasks) draft.tasks = [];
      if (!draft.tasks.some((item: Record<string, unknown>) => item.id === task.id)) {
        draft.tasks.unshift(task as CustomerTask);
        processTaskCollaborationEvents(task as CustomerTask, state, draft, true);
      }
    });
    setSelectedMeeting(null); setDecisionTitle(''); setDecisionTaskId(null); setMeetingError('');
  };

  return (
    <main className="crm-page crm-page-calendar flex-1 min-w-0 overflow-y-auto bg-transparent px-2 py-3 sm:px-4 sm:py-4 space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))]" dir="rtl" aria-label="تقویم کاری و سررسیدها">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 data-tour-heading className="text-xl font-black text-text-main tracking-tight">تقویم کاری و سررسیدهای خورشیدی</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            {isJalali ? `تقویم رسمی هجری شمسی (${monthYearDisplay})` : 'نمای تقویم میلادی'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('calendar', 'CREATE') && <Button size="sm" variant="primary" onClick={() => { setMeetingError(''); setNewMeetingOpen(true); }} icon={<Plus size={14} />}>جلسه جدید</Button>}
          <Button variant="soft" onClick={() => navigate('/tasks')} >
            میز کار وظایف <ArrowLeft size={13} />
          </Button>
        </div>
      </div>

      <div id="calendar-grid" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card padding="lg" className="bg-surface border border-border/80 shadow-subtle rounded-3xl p-6 lg:col-span-2 space-y-5">
          <div className="flex justify-between items-center border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              <h2 className="text-base font-extrabold text-text-main">{monthYearDisplay}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg border border-border/80 hover:bg-canvas text-text-secondary cursor-pointer transition-colors"
                title="ماه قبل"
              >
                <ChevronRight size={16} />
              </button>
              <Button variant="outline" size="sm" 
                onClick={handleGoToday}
              >
                امروز ({toPersianDigits(todayJalali.jd)} {JALALI_MONTH_NAMES[todayJalali.jm - 1]})
              </Button>
              <button 
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg border border-border/80 hover:bg-canvas text-text-secondary cursor-pointer transition-colors"
                title="ماه بعد"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-text-secondary">
            {weekDays.map((wd, i) => (
              <div key={i} className="py-2 text-caption font-extrabold">
                {i === 6 ? <span className="text-red-500">{wd}</span> : wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: startOffset }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-16 rounded-xl bg-canvas/30" />
            ))}
            {days.map(d => {
              const isToday = d === todayJalali.jd && currentMonth === todayJalali.jm && currentYear === todayJalali.jy;
              const isSelected = selectedDay === d;
              const dayData = itemsForDay(d);

              return (
                <div
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`h-16 p-1.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between text-right ${
                    isSelected 
                      ? 'border-primary bg-primary/10 shadow-sm' 
                      : isToday 
                        ? 'border-primary/60 bg-primary/5 font-extrabold' 
                        : 'border-border/60 bg-surface hover:bg-canvas'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-mono font-bold ${isToday ? 'text-primary' : 'text-text-main'}`}>
                      {toPersianDigits(d)}
                    </span>
                    {isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </div>
                  {dayData.count > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dayData.tasks.length > 0 && (
                        <span className="px-1 py-0.2 text-nano rounded-md bg-blue-100 text-blue-800 font-bold font-mono">
                          {toPersianDigits(dayData.tasks.length)} وظیفه
                        </span>
                      )}
                      {dayData.cheques.length > 0 && (
                        <span className="px-1 py-0.2 text-nano rounded-md bg-amber-100 text-amber-800 font-bold font-mono">
                          {toPersianDigits(dayData.cheques.length)} چک
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card padding="lg" className="bg-surface border border-border/80 shadow-subtle rounded-xl p-3 sm:p-4 space-y-3">
          <div className="flex justify-between items-center border-b border-border/60 pb-3">
            <h3 className="font-extrabold text-sm text-text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> 
              {selectedDay 
                ? `رویدادهای ${toPersianDigits(selectedDay)} ${monthName} ${toPersianDigits(currentYear)}` 
                : `برنامه امروز (${toPersianDigits(todayJalali.jd)} ${monthName})`}
            </h3>
          </div>

          <div className="flex gap-1 border-b border-border/60 pb-2">
            {[
              { id: 'ALL', label: 'همه' },
              { id: 'TASKS', label: 'وظایف' },
              { id: 'MEETINGS', label: 'جلسات' },
              { id: 'CHEQUES', label: 'چک‌ها' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id as any)}
                className={`px-2.5 py-1 text-caption rounded-lg font-bold cursor-pointer transition-colors ${
                  activeFilter === f.id ? 'bg-primary text-white' : 'text-text-secondary hover:bg-canvas'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div id="calendar-agenda" className="space-y-2 max-h-96 overflow-y-auto no-scrollbar">
            {(activeFilter === 'ALL' || activeFilter === 'MEETINGS') && activeDayData.meetings.map((m: any) => (
              <div key={m.id} className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100 space-y-1">
                <div className="flex justify-between items-start">
                  <strong className="text-xs font-bold text-purple-900">{m.title}</strong>
                  <span className="text-micro font-mono text-purple-700 font-bold">{m.startTime} - {m.endTime}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-micro text-purple-600 flex items-center gap-1"><Users size={11} /> {m.participantIds?.length || 1} شرکت‌کننده</div>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedMeeting(m); setDecisionTaskId(generateId()); setDecisionAssignee(state.currentUserId || ''); setMeetingError(''); }} >ثبت مصوبه و ارجاع وظیفه</Button>
                </div>
                {(m.actionItems || []).map((item: any) => <div key={item.id || item.taskId} className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-micro"><span className="truncate text-text-main">{item.title}</span><span className="shrink-0 text-text-secondary">{item.completed ? 'انجام‌شده' : item.dueDate || 'بدون مهلت'}</span></div>)}
              </div>
            ))}

            {(activeFilter === 'ALL' || activeFilter === 'TASKS') && activeDayData.tasks.map(t => (
              <div 
                key={t.id} 
                onClick={() => navigate('/tasks')}
                className="p-3 rounded-2xl bg-canvas border border-border/80 flex items-center justify-between hover:border-primary/50 transition-colors cursor-pointer group"
              >
                <div>
                  <span className="font-bold text-xs text-text-main group-hover:text-primary transition-colors block">{t.title}</span>
                  <span className="text-micro text-text-secondary mt-0.5 block font-mono">
                    سررسید: {formatAppDate(t.dueDate, state.settings?.locale)}
                  </span>
                </div>
                <span className="text-micro font-bold px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800">
                  وظیفه
                </span>
              </div>
            ))}

            {(activeFilter === 'ALL' || activeFilter === 'CHEQUES') && activeDayData.cheques.map(c => (
              <div 
                key={c.id} 
                onClick={() => navigate('/finance')}
                className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-center justify-between hover:border-amber-400 transition-colors cursor-pointer"
              >
                <div>
                  <span className="font-bold text-xs text-amber-900 block">{c.bankName || 'چک صیادی'}</span>
                  <span className="text-micro text-amber-700 font-mono mt-0.5 block">{c.chequeNumber || c.id}</span>
                </div>
                <div className="text-left font-mono">
                  <span className="text-xs font-bold text-amber-900">{c.amount.toLocaleString('fa-IR')} ریال</span>
                </div>
              </div>
            ))}

            {activeDayData.tasks.length === 0 && activeDayData.meetings.length === 0 && activeDayData.cheques.length === 0 && (
              <div className="text-center py-8 text-xs text-text-secondary">
                هیچ رویدادی برای این تاریخ ثبت نشده است.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal isOpen={newMeetingOpen} onClose={() => setNewMeetingOpen(false)} title="برنامه‌ریزی جلسه سازمانی" footer={<><Button size="sm" variant="ghost" onClick={() => setNewMeetingOpen(false)}>انصراف</Button><Button size="sm" variant="primary" onClick={handleCreateMeeting}>بررسی تداخل و ثبت جلسه</Button></>}>
        <div className="space-y-3 text-xs">
          {meetingError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3 text-danger"><AlertTriangle size={15} className="shrink-0" />{meetingError}</div>}
          <label className="block font-bold text-text-main">عنوان جلسه *<InputControl value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} className="mt-1" /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="font-bold text-text-main">تاریخ<InputControl type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className="mt-1" /></label><label className="font-bold text-text-main">شروع<InputControl type="time" value={meetingStart} onChange={e => setMeetingStart(e.target.value)} className="mt-1" /></label><label className="font-bold text-text-main">پایان<InputControl type="time" value={meetingEnd} onChange={e => setMeetingEnd(e.target.value)} className="mt-1" /></label></div>
          <label className="block font-bold text-text-main">محل جلسه<InputControl value={meetingLocation} onChange={e => setMeetingLocation(e.target.value)} className="mt-1" /></label>
          <label className="block font-bold text-text-main">دستور جلسه<Textarea value={meetingAgenda} onChange={e => setMeetingAgenda(e.target.value)} rows={3} className="mt-1" /></label>
          <fieldset><legend className="mb-2 font-bold text-text-main">شرکت‌کنندگان</legend><div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">{(state.users || []).filter(u => u.id !== state.currentUserId && (u.isActive ?? u.active) !== false).map(u => <label key={u.id} className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-2"><Checkbox checked={meetingParticipants.includes(u.id)} onChange={e => setMeetingParticipants(previous => e.target.checked ? [...previous, u.id] : previous.filter(id => id !== u.id))} />{u.name}</label>)}</div></fieldset>
          <p className="text-micro text-text-secondary">تداخل زمانی برای برگزارکننده و شرکت‌کنندگان مشترک بررسی می‌شود. ثبت جلسه به معنی برگزاری آن نیست.</p>
        </div>
      </Modal>

      <Modal isOpen={!!selectedMeeting} onClose={() => { setSelectedMeeting(null); setDecisionTaskId(null); }} title={selectedMeeting ? `مصوبات جلسه: ${selectedMeeting.title}` : 'مصوبه جلسه'} footer={<><Button size="sm" variant="ghost" onClick={() => setSelectedMeeting(null)}>بستن</Button><Button size="sm" variant="primary" onClick={handleCreateDecisionTask} disabled={!decisionTitle.trim()}>ایجاد وظیفه در کارتابل</Button></>}>
        <div className="space-y-3 text-xs">
          {meetingError && <p role="alert" className="rounded-lg bg-danger-soft p-2 text-danger">{meetingError}</p>}
          <p className="rounded-xl border border-border bg-canvas p-3 text-text-secondary">مصوبه به‌عنوان وظیفه ثبت و با شناسه جلسه پیوند داده می‌شود.</p>
          <label className="block font-bold text-text-main">عنوان / متن مصوبه *<Textarea value={decisionTitle} onChange={e => setDecisionTitle(e.target.value)} rows={3} className="mt-1" /></label>
          <label className="block font-bold text-text-main">مسئول پیگیری<Select value={decisionAssignee} onChange={e => setDecisionAssignee(e.target.value)} className="mt-1">{(state.users || []).filter(u => (u.isActive ?? u.active) !== false).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></label>
          <label className="block font-bold text-text-main">مهلت پیگیری<InputControl type="date" value={decisionDueDate} onChange={e => setDecisionDueDate(e.target.value)} className="mt-1" /></label>
        </div>
      </Modal>
    </main>
  );
}
