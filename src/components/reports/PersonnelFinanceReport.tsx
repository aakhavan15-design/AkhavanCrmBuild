import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AppState, CoaMirror } from '../../types';
import { useDataQuery } from '../../hooks/useDataProvider';
import { useDataSyncStatus } from '../../services/dataSyncController';
import { useLedgerBookScope } from '../../hooks/useLedgerBookScope';
import { LedgerBookSourceSelect } from '../finance/LedgerBookSourceSelect';
import { SubsidiaryBalanceDetails } from '../shared/SubsidiaryBalancesPanel';
import { DonutChart } from '../charts/DonutChart';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { SearchableSelect } from '../ui/SearchableSelect';
import { formatCurrency, getJalaliDate, jalaliToGregorianISO, toLocalDateISO } from '../../lib/utils';
import { personnelAccountCodes, buildPersonnelFinanceRows, selectedPersonnelBalance } from '../../lib/personnelFinanceReport';

const money=(n:number|null)=>n===null?'نامشخص':formatCurrency(n);
const palette=['#477B68','#B99A68','#8497B0','#B97478','#727D53','#706D96'];
export function PersonnelFinanceReport({ state }: {state:AppState}) {
  const {scope}=useLedgerBookScope();
  const {serverVersion}=useDataSyncStatus();
  const [root,setRoot]=useState('');
  const [person,setPerson]=useState<string|null>(null);
  const [account,setAccount]=useState<string|null>(null);
  const today=toLocalDateISO();
  const month=getJalaliDate(today);
  const [period,setPeriod]=useState(()=>({from:jalaliToGregorianISO(month.jy,month.jm,1),to:today}));
  const [draft,setDraft]=useState(period);
  const key=JSON.stringify([state.currentUserId,scope,serverVersion]);
  const query=useDataQuery(async provider=>{
    if(provider.name!=='SQLSERVER_BACKEND') throw new Error('این گزارش به دفتر رسمی و پرونده پرسنلی SQL نیاز دارد.');
    const [snapshot,ledger]=await Promise.all([provider.getStateSnapshot(),provider.getDetailSubsidiaryBalances(scope)]);
    const users=(snapshot.collections.users||[]).filter(u=>typeof u.id==='string'&&(u.isActive??u.active)!==false);
    const people=await Promise.all(users.map(async u=>{
      const id=String(u.id);
      try{
        const profile=await provider.getLinkedPersonnelProfile(id);
        return {userId:id,name:profile.user.name,detailCode:profile.status==='LINKED'?profile.employment?.detailCode?.trim()||null:null};
      }catch{return {userId:id,name:String(u.name||id),detailCode:null};}
    }));
    return {key,people,ledger,coa:(snapshot.collections.coaMirror||[]) as unknown as CoaMirror[]};
  },[key]);
  const data=query.data?.key===key?query.data:null;
  const codes=useMemo(()=>personnelAccountCodes(data?.coa||[],root),[data,root]);
  const rows=useMemo(()=>buildPersonnelFinanceRows(data?.people||[],data?.ledger||null,codes),[data,codes]);
  const selected=rows.find(r=>r.userId===person);
  const visible=person?rows.filter(r=>r.userId===person):rows;
  const accountTotals=new Map<string,number>();
  const debitTotals=new Map<string,number>();
  for(const row of visible)if(row.balance!==null)for(const a of row.accounts)if(a.subsidiaryCode){
    accountTotals.set(a.subsidiaryCode,(accountTotals.get(a.subsidiaryCode)||0)+a.balance);
    if(a.balance>0)debitTotals.set(a.subsidiaryCode,(debitTotals.get(a.subsidiaryCode)||0)+a.balance);
  }
  const label=(code:string)=>data?.coa.find(a=>a.code===code)?.name||code;
  const segments=[...debitTotals].filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([code,value],i)=>({code,label:label(code)+' · '+code,value,color:palette[i%palette.length]}));
  const max=Math.max(1,...rows.flatMap(r=>[Math.abs(r.balance??0),...r.accounts.map(a=>Math.abs(a.balance))]));
  const sum=visible.length&&visible.every(r=>r.balance!==null)?visible.reduce((n,r)=>n+(selectedPersonnelBalance(r,account)??0),0):null;
  return <section dir="rtl" className="space-y-3" aria-label="تحلیل مالی پرسنل">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-bold">تحلیل مالی و سودآوری پرسنل</h2><Link className="text-sm text-primary" to="/reports?tab=sales">بازگشت به گزارش‌ها</Link></div>
    <LedgerBookSourceSelect viewer={state.currentUserId}/>
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <SearchableSelect inputId="personnel-ledger-root" label="گروه معین‌های بدهی پرسنل از کدینگ رسمی"
        value={root} onChange={value=>{setRoot(value);setAccount(null);setPerson(null)}}
        placeholder="انتخاب سرفصل کل یا گروه مربوط به کارکنان"
        options={(data?.coa||[]).filter(a=>a.code&&a.isActive!==false).map(a=>({value:a.code,label:a.name,subLabel:a.code}))}
        loading={query.loading} />
      <p className="text-xs text-text-secondary">مانده از اسناد قطعی دفتر؛ سند افتتاحیه دوباره اضافه نمی‌شود. انتخاب سرفصل، زیرمجموعه واقعی آن را وارد گزارش می‌کند.</p>
    </div>
    {query.error&&<p role="alert" className="rounded-lg border border-danger/40 p-3 text-sm text-danger">{query.error.message} <button onClick={()=>void query.refetch()} type="button">تلاش مجدد</button></p>}
    {query.loading&&<p role="status" className="text-xs text-text-secondary">در حال دریافت دفتر و پرونده‌ها…</p>}
    {data&&<><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[['مانده دفتری منتخب',money(sum)],['حقوق و پورسانت ماه جاری','نامشخص'],['پیش‌بینی پایان ماه','نامشخص'],['سودآوری دوره','نامشخص']].map(([title,value])=><div key={title} className="rounded-xl border border-border bg-surface p-3"><p className="text-xs text-text-secondary">{title}</p><strong className="block mt-2 text-sm tabular-nums">{value}</strong></div>)}
    </div>
    <p className="text-xs text-text-secondary">تاریخ پوشش دفتر: {data.ledger.asOf||'نامشخص'} · مبالغ ریالی. حقوق کارکرد و سود منتسب به ویزیتور تا اتصال شواهد معتبر محاسبه نمی‌شوند.</p>
    <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-2xl border border-border bg-surface p-3 min-w-0">
        <div className="flex justify-between gap-2"><h3 className="text-sm font-bold">مقایسه مالی کارکنان</h3><button type="button" onClick={()=>{setPerson(null);setAccount(null)}} className="text-xs text-primary">حذف فیلتر</button></div>
        <div className="flex flex-wrap gap-2 py-2 text-xs text-text-secondary"><span>بدهی دفتری: رنگ اصلی</span><span>حقوق، پیش‌بینی و سود: نامشخص تا تأیید منبع</span></div>
        <div className="overflow-x-auto"><div className="flex items-end gap-4 min-w-max pt-3" dir="ltr">
          {rows.map(r=>{const value=selectedPersonnelBalance(r,account);return <button type="button" key={r.userId} aria-pressed={person===r.userId} onClick={()=>setPerson(old=>old===r.userId?null:r.userId)} className={'rounded-lg px-1 py-2 text-xs '+(person===r.userId?'bg-primary/10':'')}><div className="flex items-end gap-1 h-36 justify-center"><div className="flex flex-col items-center justify-end w-12"><span className="text-[10px]" dir="rtl">{value===null?'؟':money(value)}</span><div className={value!==null&&value<0?'bg-success rounded-t':'bg-primary rounded-t'} style={{height:value===null?0:Math.abs(value)/max*95,width:18}}/></div>{['حقوق','پیش‌بینی','سود'].map(k=><span key={k} title={k+' نامشخص'} className="w-4 border-b border-dashed border-border text-center">—</span>)}</div><div dir="rtl" className="max-w-28 truncate mt-2">{r.name}</div></button>})}
        </div></div>
        {!rows.length&&<p className="text-xs text-text-secondary p-3">پرونده پرسنلی در داده قابل مشاهده یافت نشد.</p>}
      </div>
      <div className="rounded-2xl border border-border bg-surface p-3 min-w-0">
        <h3 className="text-sm font-bold">تمرکز مانده‌های بدهکار معین</h3><p className="text-xs text-text-secondary">{selected?.name||'تمام کارکنان'} · جمع مانده‌های بدهکار بدون تهاتر با بستانکار سایر کارکنان؛ جدول، خالص هر معین را نشان می‌دهد.</p>
        {segments.length?<DonutChart segments={segments} centerLabel="مانده بدهکار" formatValue={money} activeSegment={segments.find(s=>s.code===account)?.label||null} onSegmentClick={s=>{const code=segments.find(x=>x.label===s.label)?.code;if(code)setAccount(old=>old===code?null:code)}}/>:<p className="text-xs text-text-secondary py-4">مانده بدهکار معتبر در گروه انتخابی موجود نیست.</p>}
        {[...accountTotals].map(([code,value])=><button key={code} type="button" aria-pressed={account===code} onClick={()=>setAccount(old=>old===code?null:code)} className="flex w-full justify-between gap-2 border-b border-border py-2 text-xs"><span>{label(code)} · {code}</span><strong>{money(value)}</strong></button>)}
      </div>
    </div>
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <h3 className="text-sm font-bold">بازه مستقل سودآوری</h3>
      <form onSubmit={e=>{e.preventDefault();if(draft.from&&draft.to&&draft.from<=draft.to&&draft.to<=today)setPeriod(draft)}} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs">از تاریخ<CustomDatePicker value={draft.from} onChange={from=>setDraft(old=>({...old,from}))}/></label>
        <label className="text-xs">تا تاریخ<CustomDatePicker value={draft.to} onChange={to=>setDraft(old=>({...old,to}))}/></label>
        <button type="submit" className="rounded-lg border border-border p-2 text-xs" disabled={!draft.from||!draft.to||draft.from>draft.to||draft.to>today}>اعمال بازه سود</button>
      </form>
      <p className="text-xs text-text-secondary" role="status">بازه منتخب: {period.from} تا {period.to} · سود منتسب هنوز در دسترس نیست. تغییر این بازه بر مانده و حقوق اثر ندارد.</p>
      <Link className="text-xs text-primary" to="/reports?view=analytical&report=1">گزارش سود و زیان موجود</Link>
    </div>
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <h3 className="text-sm font-bold">ریز مانده معین × تفصیلی</h3>
      {visible.map(r=><div key={r.userId} className="rounded-lg border border-border p-2">
        <button type="button" aria-pressed={person===r.userId} onClick={()=>setPerson(old=>old===r.userId?null:r.userId)} className="flex w-full justify-between gap-2 text-xs"><strong>{r.name}</strong><span>{money(selectedPersonnelBalance(r,account))}</span></button>
        {r.reason?<p className="text-xs text-text-secondary">{r.reason}</p>:person===r.userId&&r.detailCode&&<SubsidiaryBalanceDetails detailKey={r.detailCode} rows={r.accounts.filter(a=>!account||a.subsidiaryCode===account)}/>}
      </div>)}
    </div></>}
  </section>;
}
