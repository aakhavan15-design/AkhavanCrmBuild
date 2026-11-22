import { useEffect, useRef, useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount, formatNumber } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import { getActiveDataProvider } from '../../services/dataProvider';
import { learningActions, learningStatuses, type LearningAction, type LearningActionInput, type LearningDetail } from '../../services/personnelLearning';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Textarea } from '../ui/Input';
import { LoadingState } from '../ui/LoadingState';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';

const attemptLabels = { ACTIVE: 'در حال انجام', PASSED: 'حدنصاب کسب شد', FAILED: 'کمتر از حدنصاب', EXPIRED: 'پایان زمان یا توقف' };
const clock = new Intl.DateTimeFormat('fa-IR', {timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'});
const count = (value: number) => formatCount(value);

function ExamForm({ exam, busy, onSubmit, onRefresh }: {
  exam: NonNullable<LearningDetail['exam']>; busy: boolean;
  onSubmit: (data: { attemptId: string; answers: number[]; evidence: string }) => void;
  onRefresh: () => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => exam.questions.map(() => null));
  const [evidence, setEvidence] = useState('');
  const [now, setNow] = useState(Date.now);
  const deadline = Date.parse(exam.deadline);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (seconds === 0) return <div className="space-y-2">
    <p role="status" className="text-caption text-warning">مهلت آزمون به پایان رسیده است.</p>
    <Button type="button" variant="outline" size="sm" onClick={onRefresh}>دریافت وضعیت از سرور</Button>
  </div>;

  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault();
    if (Date.now() >= deadline || answers.some(answer => answer === null) || !evidence.trim()) return;
    onSubmit({ attemptId: exam.id, answers: answers as number[], evidence: evidence.trim() });
  }}>
    <p className="text-caption text-text-secondary">زمان باقی‌مانده {count(Math.floor(seconds/60))} دقیقه و {count(seconds%60)} ثانیه · پایان {clock.format(deadline)}</p>
    {exam.questions.map((question, index) => <fieldset key={index} className="space-y-1 rounded-lg border border-border p-2" disabled={busy}>
      <legend className="px-1 font-semibold">{count(index+1)}. {question.prompt}</legend>
      {question.options.map((option, optionIndex) => <label key={optionIndex} className="flex min-h-11 items-start gap-2 py-2 text-sm">
        <input type="radio" name={'question-'+index} required checked={answers[index]===optionIndex}
          onChange={() => setAnswers(previous => previous.map((value, i) => i===index ? optionIndex : value))} />
        {option}
      </label>)}
    </fieldset>)}
    <Textarea label="شرح تمرین و شواهد یادگیری" required value={evidence} maxLength={1000} rows={3} disabled={busy}
      onChange={event => setEvidence(event.target.value)} />
    <Button type="submit" loading={busy} disabled={!evidence.trim() || answers.some(answer => answer === null)}>ارسال پاسخ‌ها</Button>
  </form>;
}

function EnrollmentDetails({ initial, review, onClose, onChanged }: {
  initial: LearningDetail; review: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [item, setItem] = useState(initial);
  const [decision, setDecision] = useState<LearningAction | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{ key: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const available = item.attempts.length < item.maxAttempts;
  const options: LearningAction[] = ['AWAITING_REVIEW','CONDITIONAL'].includes(item.status) ? [
    'APPROVE', ...(item.status==='AWAITING_REVIEW' ? ['CONDITIONAL' as const] : []), 'RETRY',
  ] : item.status==='PAUSED' ? ['RESUME'] : ['LEARNING','EXAM_READY','RETRY'].includes(item.status) ? ['PAUSE'] : [];

  async function change(action: LearningAction, data: Partial<LearningActionInput> = {}) {
    if (inFlight.current) return;
    const body = { ...data, action, revision: item.revision };
    const key = JSON.stringify(body);
    const commandId = pending.current?.key===key ? pending.current.id : crypto.randomUUID();
    pending.current = { key, id: commandId };
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const receipt = await getActiveDataProvider().changePersonnelLearning(item.id,{...body,commandId});
      if (receipt.id.toLowerCase()!==item.id.toLowerCase()) throw new Error('رسید ثبت از سرور دریافت نشد.');
      setItem(receipt); setNote(''); setDecision(''); pending.current = null;
      setNotice(action==='SUBMIT_EXAM' ? learningStatuses[receipt.status] : 'اقدام در پرونده ثبت شد.');
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت اقدام ممکن نشد.');
    } finally { inFlight.current=false; setBusy(false); }
  }

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current=true; setBusy(true); setError('');
    try { setItem(await getActiveDataProvider().getPersonnelLearning(item.id,review)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'دریافت وضعیت ممکن نشد.'); }
    finally { inFlight.current=false; setBusy(false); }
  }

  return <Modal isOpen title={item.title} subtitle={review ? item.employee : learningStatuses[item.status]}
    onClose={() => { if (!busy) onClose(); }} hasUnsavedChanges={Boolean(item.exam || note.trim())}>
    <div className="space-y-3">
      <p className="text-caption text-text-secondary">سطح {count(item.level)} · نسخهٔ {count(item.version)} · حدنصاب {count(item.passPercent)} درصد · زمان {count(item.timeLimit)} دقیقه</p>
      {review && <p className="text-sm font-semibold">{learningStatuses[item.status]}</p>}
      {item.decisionAt && <p className="text-caption">{item.reviewer ?? 'سرپرست'} · {formatAppDate(item.decisionAt)} · {item.decisionNote}</p>}
      {notice && <p role="status" className="text-caption">{notice}</p>}
      {!item.exam && <details className="space-y-2" open={item.status==='LEARNING' || undefined}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">محتوای دوره</summary>
        {item.lessons.map((lesson,index) => <div key={index} className="space-y-1 border-t border-border pt-2">
          <h3 className="text-sm font-semibold">{lesson.title}</h3>
          <p className="whitespace-pre-wrap wrap-break-word text-sm">{lesson.body}</p>
          {lesson.resource && <a href={lesson.resource} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-primary">باز کردن منبع درس</a>}
        </div>)}
      </details>}
      {!review && !item.exam && item.status==='LEARNING' && <Button type="button" loading={busy}
        onClick={()=>void change('COMPLETE_CONTENT')}>مطالعه را کامل کردم</Button>}
      {!review && !item.exam && ['EXAM_READY','RETRY'].includes(item.status) && <div className="space-y-2">
        <p className="text-caption text-text-secondary">{available ? 'زمان آزمون با انتخاب «شروع آزمون» آغاز می‌شود.' : 'همهٔ فرصت‌های آزمون استفاده شده‌اند.'}</p>
        <Button type="button" loading={busy} onClick={()=>void change('START_EXAM')}>{available ? 'شروع آزمون' : 'ثبت پایان فرصت'}</Button>
      </div>}
      {!review && item.exam && <ExamForm key={item.exam.id} exam={item.exam} busy={busy}
        onSubmit={data=>void change('SUBMIT_EXAM',data)} onRefresh={()=>void refresh()} />}
      {!review && item.status==='CONDITIONAL' && <form className="space-y-2" onSubmit={event=>{
        event.preventDefault();
        if (note.trim()) void change('COMPLETE_CONDITION',{note:note.trim()});
      }}>
        <Textarea label="شرح اقدام و شواهد انجام شرط" required maxLength={1000} rows={3} value={note}
          disabled={busy} onChange={event=>setNote(event.target.value)}/>
        <Button type="submit" loading={busy} disabled={!note.trim()}>ارسال برای بررسی سرپرست</Button>
      </form>}
      {item.attempts.length>0 && <details open={review || undefined} className="space-y-2">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">تلاش‌های آزمون</summary>
        <ul className="divide-y divide-border">{item.attempts.map(attempt=><li key={attempt.id} className="space-y-1 py-2 text-caption">
          <p>تلاش {count(attempt.number)} · {attemptLabels[attempt.status]}{attempt.score!==null && <> · نمره {formatNumber(attempt.score)}٪</>}</p>
          <p className="text-text-secondary">{formatAppDate(attempt.finishedAt ?? attempt.startedAt)}</p>
          {attempt.evidence && <p className="whitespace-pre-wrap wrap-break-word">{attempt.evidence}</p>}
        </li>)}</ul>
      </details>}
      {review && options.length>0 && <form className="space-y-2 border-t border-border pt-2" onSubmit={event=>{
        event.preventDefault(); if (decision && options.includes(decision) && note.trim()) void change(decision,{note:note.trim()});
      }}>
        <SearchableSelect label="تصمیم سرپرست" value={decision} options={options.map(value=>({value,label:learningActions[value]}))}
          disabled={busy} onChange={value=>setDecision(value as LearningAction)}/>
        <Textarea label="دلایل و شرایط تصمیم" required maxLength={1000} rows={3} value={note}
          disabled={busy} onChange={event=>setNote(event.target.value)}/>
        <Button type="submit" loading={busy} disabled={!decision || !note.trim()}>ثبت تصمیم</Button>
      </form>}
      {error && <div className="space-y-1">
        <p role="alert" className="text-caption text-danger">{error}</p>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>void refresh()}>دریافت آخرین وضعیت</Button>
      </div>}
      {!item.exam && item.history.length>0 && <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">تاریخچهٔ آموزش</summary>
        <ul className="divide-y divide-border">{item.history.map(event=><li key={event.id} className="space-y-1 py-2 text-caption">
          <p>{learningActions[event.action]} · {event.actor ?? 'کاربر'} · {formatAppDate(event.at)}</p>
          {event.note && <p className="whitespace-pre-wrap wrap-break-word">{event.note}</p>}
        </li>)}</ul>
      </details>}
    </div>
  </Modal>;
}

export function PersonnelLearningPanel({ viewer, canReview }: { viewer: string; canReview: boolean }) {
  const [reviewMode, setReviewMode] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const review = canReview && reviewMode;
  const key = JSON.stringify([viewer,review,page]);
  const list = useDataQuery(async provider=>({key,result:await provider.listPersonnelLearning(review,page)}),[key]);
  const result = list.data?.key===key ? list.data.result : null;
  const detailKey = JSON.stringify([viewer,review,selected]);
  const details = useDataQuery(async provider=>selected ? {detailKey,item:await provider.getPersonnelLearning(selected,review)} : null,[detailKey]);
  const detail = details.data?.detailKey===detailKey ? details.data.item : null;

  return <Card className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">{review ? 'آموزش نیروهای زیرمجموعه' : 'مسیر آموزش من'}</h2>
      {canReview && <Button type="button" size="sm" variant="outline" onClick={()=>{
        setSelected(null); setPage(1); setReviewMode(!review);
      }}>{review ? 'آموزش من' : 'بررسی آموزش زیرمجموعه'}</Button>}
    </div>
    {list.error ? <EmptyState compact title="دریافت دوره‌ها ممکن نیست" description={list.error.message}
      actionLabel="تلاش دوباره" onAction={()=>void list.refetch()}/> : (!result || list.loading) ? <LoadingState label="در حال دریافت دوره‌ها…"/> : <>
      {result.paths.length>0 && <ul className="space-y-1 text-caption text-text-secondary">{result.paths.map(path=><li key={path.pathCode}>
        <bdi>{path.pathCode}</bdi> · {path.currentLevel ? `سطح تأییدشدهٔ ${count(path.currentLevel)}` : 'در آغاز مسیر'}
        {' · '}{path.nextLevel===null ? 'سطح بعدی منتشر نشده' : `سطح بعدی ${count(path.nextLevel)}${path.nextAssigned ? '' : '، منتظر تخصیص'}`}
      </li>)}</ul>}
      {result.items.length ? <ul className="divide-y divide-border">{result.items.map(item=><li key={item.id}>
        <button type="button" onClick={()=>setSelected(item.id)} className="min-h-11 w-full rounded-lg px-1 py-2 text-start hover:bg-hover">
          <span className="block font-semibold">{item.title}{review && <> · {item.employee}</>}</span>
          <span className="block text-caption text-text-secondary">سطح {count(item.level)} · {learningStatuses[item.status]}</span>
        </button>
      </li>)}</ul> : <EmptyState compact title={review ? 'پروندهٔ آموزشی در دسترس نیست' : 'دوره‌ای به شما تخصیص نیافته است'}/>}
      {(page>1 || result.hasMore) && <nav className="flex flex-wrap gap-2" aria-label="صفحه‌بندی آموزش">
        <Button type="button" variant="ghost" size="sm" disabled={page===1} onClick={()=>setPage(current=>current-1)}>قبلی</Button>
        <Button type="button" variant="ghost" size="sm" disabled={!result.hasMore} onClick={()=>setPage(current=>current+1)}>بعدی</Button>
      </nav>}
    </>}
    {selected && (detail && !details.loading && !details.error
      ? <EnrollmentDetails key={detailKey} initial={detail} review={review} onClose={()=>setSelected(null)} onChanged={()=>void list.refetch()}/>
      : <Modal isOpen title="پروندهٔ آموزش" size="sm" onClose={()=>setSelected(null)}>
        {details.error ? <EmptyState compact title="پرونده در دسترس نیست" description={details.error.message}
          actionLabel="تلاش دوباره" onAction={()=>void details.refetch()}/> : <LoadingState label="در حال دریافت پرونده…"/>}
      </Modal>)}
  </Card>;
}
