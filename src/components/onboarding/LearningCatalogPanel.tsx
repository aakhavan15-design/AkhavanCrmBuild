import { useRef, useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount } from '../../lib/format';
import { getActiveDataProvider } from '../../services/dataProvider';
import type { LearningCourseInput } from '../../services/personnelLearning';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';

const newLesson = () => ({ title: '', body: '', resource: '' });
const newQuestion = () => ({ prompt: '', options: ['', ''], correct: 0 });
const blank = () => ({
  pathCode: '', role: '', level: 1, title: '', passPercent: 70, timeLimit: 30, maxAttempts: 3,
  lessons: [newLesson()], questions: [newQuestion()],
});
type Draft = ReturnType<typeof blank>;

function CourseEditor({ initial, onClose, onSaved }: {
  initial: Draft; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const attempt = useRef<{ key:string; id:string } | null>(null);
  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]:value }));
  const lesson = (index: number, updates: Partial<Draft['lessons'][number]>) => setDraft(current => ({
    ...current, lessons: current.lessons.map((row,i)=>i===index ? {...row,...updates} : row),
  }));
  const question = (index: number, updates: Partial<Draft['questions'][number]>) => setDraft(current => ({
    ...current, questions: current.questions.map((row,i)=>i===index ? {...row,...updates} : row),
  }));

  async function save() {
    if (inFlight.current) return;
    const key = JSON.stringify(draft);
    const commandId = attempt.current?.key===key ? attempt.current.id : crypto.randomUUID();
    const payload: LearningCourseInput = { ...draft, commandId };
    attempt.current={key,id:commandId}; inFlight.current=true; setBusy(true); setError('');
    try {
      const receipt=await getActiveDataProvider().publishLearningCourse(payload);
      if (receipt.id.toLowerCase()!==commandId) throw new Error('رسید انتشار از سرور دریافت نشد.');
      onSaved('نسخهٔ دوره منتشر شد.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'انتشار دوره ممکن نشد.');
    } finally { inFlight.current=false; setBusy(false); }
  }

  return <Modal isOpen size="xl" title="انتشار نسخهٔ دوره" onClose={()=>{if(!busy)onClose();}} hasUnsavedChanges={draft!==initial}>
    <form className="space-y-3" onSubmit={event=>{event.preventDefault();void save();}}>
      <p className="text-caption text-text-secondary">دوره‌های تخصیص‌یافته به نسخهٔ اولیهٔ خود متصل می‌مانند.</p>
      <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
        <Input label="عنوان دوره" value={draft.title} maxLength={160} required onChange={event=>set('title',event.target.value)}/>
        <Input label="نقش شغلی" value={draft.role} maxLength={120} required onChange={event=>set('role',event.target.value)}/>
        <Input label="کد مسیر با حروف لاتین یا عدد" value={draft.pathCode} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9\-]{0,39}" required
          onChange={event=>set('pathCode',event.target.value)}/>
        <Input label="سطح" type="number" min={1} max={40} required value={draft.level || ''} onChange={event=>set('level',Number(event.target.value))}/>
        <Input label="حدنصاب از ۱۰۰" type="number" min={1} max={100} required value={draft.passPercent || ''} onChange={event=>set('passPercent',Number(event.target.value))}/>
        <Input label="زمان آزمون به دقیقه" type="number" min={1} max={180} required value={draft.timeLimit || ''} onChange={event=>set('timeLimit',Number(event.target.value))}/>
        <Input label="حداکثر تعداد تلاش" type="number" min={1} max={12} required value={draft.maxAttempts || ''} onChange={event=>set('maxAttempts',Number(event.target.value))}/>
      </fieldset>
      <section className="space-y-2" aria-label="درس‌ها">
        <h3 className="font-semibold">درس‌ها</h3>
        {draft.lessons.map((row,index)=><fieldset key={index} disabled={busy} className="space-y-2 rounded-lg border border-border p-2">
          <legend className="px-1 font-semibold">درس {formatCount(index+1)}</legend>
          <Input label="عنوان درس" value={row.title} maxLength={160} required onChange={event=>lesson(index,{title:event.target.value})}/>
          <Textarea label="متن آموزشی" value={row.body} maxLength={4500} rows={4} required onChange={event=>lesson(index,{body:event.target.value})}/>
          <Input label="پیوند فایل، ویدئو یا منبع" type="url" value={row.resource} maxLength={1000}
            onChange={event=>lesson(index,{resource:event.target.value})}/>
          {draft.lessons.length>1 && <Button type="button" size="sm" variant="ghost" onClick={()=>set('lessons',draft.lessons.filter((_,i)=>i!==index))}>برداشتن درس</Button>}
        </fieldset>)}
        {draft.lessons.length<20 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>set('lessons',[...draft.lessons,newLesson()])}>افزودن درس</Button>}
      </section>
      <section className="space-y-2" aria-label="پرسش‌های آزمون">
        <h3 className="font-semibold">پرسش‌های آزمون</h3>
        {draft.questions.map((row,index)=><fieldset key={index} disabled={busy} className="space-y-2 rounded-lg border border-border p-2">
          <legend className="px-1 font-semibold">پرسش {formatCount(index+1)}</legend>
          <Textarea label="صورت پرسش" value={row.prompt} maxLength={500} rows={2} required onChange={event=>question(index,{prompt:event.target.value})}/>
          {row.options.map((option,i)=><Input key={i} label={`گزینهٔ ${formatCount(i+1)}`} value={option} required maxLength={250}
            onChange={event=>question(index,{options:row.options.map((value,j)=>j===i ? event.target.value : value)})}/>)}
          <SearchableSelect label="گزینهٔ درست" value={String(row.correct)} disabled={busy}
            options={row.options.map((_,i)=>({value:String(i),label:`گزینهٔ ${formatCount(i+1)}`}))}
            onChange={value=>question(index,{correct:Number(value)})}/>
          <div className="flex flex-wrap gap-2">
            {row.options.length<5 && <Button type="button" size="sm" variant="ghost" onClick={()=>question(index,{options:[...row.options,'']})}>افزودن گزینه</Button>}
            {row.options.length>2 && <Button type="button" size="sm" variant="ghost" onClick={()=>question(index,{options:row.options.slice(0,-1),correct:Math.min(row.correct,row.options.length-2)})}>برداشتن گزینهٔ آخر</Button>}
            {draft.questions.length>1 && <Button type="button" size="sm" variant="ghost" onClick={()=>set('questions',draft.questions.filter((_,i)=>i!==index))}>برداشتن پرسش</Button>}
          </div>
        </fieldset>)}
        {draft.questions.length<30 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>set('questions',[...draft.questions,newQuestion()])}>افزودن پرسش</Button>}
      </section>
      {error && <p role="alert" className="text-caption text-danger">{error}</p>}
      <Button type="submit" loading={busy}>انتشار نسخه</Button>
    </form>
  </Modal>;
}

export function LearningCatalogPanel({viewer}: {viewer: string}) {
  const [search,setSearch] = useState('');
  const [employee,setEmployee] = useState('');
  const [course,setCourse] = useState('');
  const [editor,setEditor] = useState<Draft | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const attempt = useRef<{key:string;id:string} | null>(null);
  const inFlight = useRef(false);
  const key = JSON.stringify([viewer,search,employee]);
  const query = useDataQuery(async provider=>({key, catalog:await provider.getLearningCatalog(search,employee || undefined)}),[key]);
  const catalog = query.data?.key===key && !query.error ? query.data.catalog : null;
  const person = catalog?.employees.find(row=>row.id===employee);

  async function assign() {
    if (!person || !catalog?.courses.some(row=>row.id===course) || inFlight.current) return;
    const assignmentKey=JSON.stringify([employee,course]);
    const commandId=attempt.current?.key===assignmentKey ? attempt.current.id : crypto.randomUUID();
    attempt.current={key:assignmentKey,id:commandId};inFlight.current=true;setBusy(true); setError(''); setNotice('');
    try {
      const receipt=await getActiveDataProvider().assignLearningCourse({commandId,employeeId:employee,courseId:course});
      if (receipt.id.toLowerCase()!==commandId) throw new Error('رسید تخصیص از سرور دریافت نشد.');
      attempt.current=null;setCourse('');setNotice('دوره به کارمند تخصیص یافت.');
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : 'تخصیص دوره ممکن نشد.');
    } finally {inFlight.current=false;setBusy(false);}
  }

  return <Card className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">دوره‌ها و مسیرهای آموزشی</h2>
      <Button type="button" size="sm" variant="outline" onClick={()=>{setEditor({...blank(),role:person?.role ?? ''});setNotice('');}}>انتشار دوره</Button>
    </div>
    <form className="space-y-2" onSubmit={event=>{event.preventDefault();void assign();}}>
      <SearchableSelect label="کارمند" value={employee} options={(catalog?.employees ?? []).map(row=>({value:row.id,label:row.name,subLabel:[row.code,row.role].filter(Boolean).join(' · ')}))}
        onChange={value=>{setEmployee(value);setCourse('');setNotice('');setError('');}} onSearch={value=>setSearch(value.slice(0,100))}
        loading={query.loading} disabled={busy} />
      <SearchableSelect label="دورهٔ متناسب با نقش" value={course} loading={query.loading && !!employee}
        options={(catalog?.courses ?? []).map(row=>({value:row.id,label:row.title,subLabel:`${row.pathCode} · سطح ${formatCount(row.level)} · نسخهٔ ${formatCount(row.version)}`}))}
        onChange={setCourse} disabled={!person || busy} />
      {person && !person.role && <p className="text-caption text-warning">نقش آموزشی این کارمند از نقش عملیاتی یا سمت پرونده تعیین می‌شود. هیچ‌کدام ثبت نشده‌اند.</p>}
      {person?.role && catalog?.courses.length===0 && <p className="text-caption text-text-secondary">برای این نقش دوره‌ای منتشر نشده است.</p>}
      {employee && <Button type="submit" loading={busy} disabled={!person || !course || query.loading}>تخصیص دوره</Button>}
    </form>
    {query.error && <div className="space-y-1">
      <p role="alert" className="text-caption text-danger">{query.error.message}</p>
      <Button type="button" size="sm" variant="ghost" onClick={()=>void query.refetch()}>تلاش دوباره</Button>
    </div>}
    {error && <p role="alert" className="text-caption text-danger">{error}</p>}
    {notice && <p role="status" className="text-caption text-success">{notice}</p>}
    {!person && !!catalog?.courses.length && <details>
      <summary className="min-h-11 cursor-pointer py-2 text-caption font-semibold">دوره‌های منتشرشده</summary>
      <ul className="divide-y divide-border">{catalog.courses.map(row=><li key={row.id} className="py-2 text-caption">
        <p className="font-semibold">{row.title} · {row.role}</p>
        <p className="text-text-secondary"><bdi>{row.pathCode}</bdi> · سطح {formatCount(row.level)} · نسخهٔ {formatCount(row.version)}</p>
      </li>)}</ul>
    </details>}
    {editor && <CourseEditor initial={editor} onClose={()=>setEditor(null)} onSaved={message=>{
      setEditor(null);setNotice(message);void query.refetch();
    }}/>}
  </Card>;
}
