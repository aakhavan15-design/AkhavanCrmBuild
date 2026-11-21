import { useEffect, useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount } from '../../lib/format';
import { getActiveDataProvider } from '../../services/dataProvider';
import type { TaskRequestFile } from '../../services/taskRequests';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export type QueuedRequestFile={id:string;file:File};
const extensions=['application/pdf','image/jpeg','image/png','image/webp'];

function ImagePreview({file}:{file:File}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{
    const objectUrl=URL.createObjectURL(file);
    setUrl(objectUrl);
    return ()=>URL.revokeObjectURL(objectUrl);
  },[file]);
  return url ? <img src={url} alt="" className="size-12 shrink-0 rounded-lg object-cover"/> : null;
}

export function RequestFilePicker({files,setFiles,disabled=false}:{
  files:QueuedRequestFile[];setFiles:(files:QueuedRequestFile[])=>void;disabled?:boolean;
}) {
  const [error,setError]=useState('');
  return <div className="space-y-1">
    <Input label="افزودن تصویر یا مدرک" type="file" accept={extensions.join(',')} multiple disabled={disabled}
      onChange={event=>{
        const picked=Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value='';
        if (picked.some(file=>!extensions.includes(file.type) || file.size<=0 || file.size>5*1024*1024) || files.length+picked.length>8) {
          setError('حداکثر ۸ تصویر یا PDF و برای هر فایل حداکثر ۵ مگابایت مجاز است.');return;
        }
        setError('');setFiles([...files,...picked.map(file=>({id:crypto.randomUUID(),file}))]);
      }}/>
    {error && <p role="alert" className="text-danger text-caption">{error}</p>}
    {files.length>0 && <ul className="divide-y divide-border">
      {files.map(item=><li key={item.id} className="flex min-w-0 items-center gap-2 py-1 text-caption">
        {item.file.type.startsWith('image/') && <ImagePreview file={item.file}/>}
        <bdi className="min-w-0 flex-1 wrap-break-word">{item.file.name}</bdi>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={()=>setFiles(files.filter(file=>file.id!==item.id))}>حذف</Button>
      </li>)}
    </ul>}
  </div>;
}

export function TaskRequestFiles({id,canUpload,onChanged}:{id:string;canUpload:boolean;onChanged:()=>void}) {
  const [open,setOpen]=useState(false);
  const [queue,setQueue]=useState<QueuedRequestFile[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const {data,refetch,loading,error}=useDataQuery(provider=>open ? provider.listTaskRequestFiles(id):Promise.resolve(null),[open,id]);
  async function upload() {
    setBusy(true);setMessage('');
    try {
      for (const item of queue) {
        await getActiveDataProvider().uploadTaskRequestFile(id,item.file,item.id);
        setQueue(current=>current.filter(file=>file.id!==item.id));
      }
      setMessage('مدارک ثبت شدند.');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ثبت فایل انجام نشد.');
    } finally {setBusy(false);void refetch();onChanged();}
  }
  async function download(file:TaskRequestFile) {
    setMessage('');
    try {
      const result=await getActiveDataProvider().getTaskRequestFile(id,file.id);
      const decoded=Uint8Array.from(atob(result.data),character=>character.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([decoded],{type:'application/octet-stream'}));
      const link=document.createElement('a');
      link.href=url; link.download=result.name; link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch (reason) {setMessage(reason instanceof Error ? reason.message : 'دریافت فایل ممکن نیست.');}
  }
  return <details className="rounded-xl border border-border p-2" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer content-center font-semibold">مدارک و پیوست‌ها</summary>
    {open && <div className="space-y-2">
      {loading ? <p role="status" className="text-caption">در حال دریافت فهرست مدارک…</p>
        : error ? <p role="alert" className="text-danger text-caption">{error.message}</p>
        : data?.items.length ? <ul className="divide-y divide-border">
          {data.items.map(file=><li key={file.id} className="flex items-center justify-between gap-2 py-1 text-caption">
            <bdi className="min-w-0 wrap-break-word">{file.name}</bdi>
            <span className="shrink-0">{formatCount(Math.ceil(file.size/1024))} کیلوبایت</span>
            <Button type="button" variant="ghost" size="sm" onClick={()=>void download(file)}>دریافت</Button>
          </li>)}
        </ul> : <p className="text-caption text-text-secondary">پیوستی ثبت نشده است.</p>}
      {canUpload && <><RequestFilePicker files={queue} setFiles={setQueue} disabled={busy}/>
        {queue.length>0 && <Button type="button" disabled={busy} onClick={()=>void upload()}>{busy?'در حال ثبت…':'ثبت پیوست‌ها'}</Button>}</>}
      {message && <p role="status" className="text-caption">{message}</p>}
    </div>}
  </details>;
}
