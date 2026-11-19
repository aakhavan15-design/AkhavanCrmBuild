import React, { useRef, useState } from 'react';
import { Camera, Paperclip, X, FileText } from 'lucide-react';
import { Button } from '../ui/Button';

export interface DocFile { fileName: string; fileType: string; fileSize: number; base64Data: string }
const MAX = 3 * 1024 * 1024;

/** انتخاب مدرک با دوربین یا گالری + پیش‌نمایش (تصویر یا PDF، حداکثر ۳ مگابایت). */
export function DocumentField({ label, required, value, onChange, hint }: { label: string; required?: boolean; value: DocFile | null; onChange: (f: DocFile | null) => void; hint?: string }) {
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null); const [err, setErr] = useState('');
  const pick = (f?: File) => {
    if (!f) return; setErr('');
    if (!/^image\//.test(f.type) && f.type !== 'application/pdf') { setErr('فقط تصویر یا پی‌دی‌اف مجاز است.'); return; }
    if (f.size > MAX) { setErr('حجم فایل نباید بیشتر از ۳ مگابایت باشد.'); return; }
    const r = new FileReader(); r.onload = () => onChange({ fileName: f.name, fileType: f.type, fileSize: f.size, base64Data: String(r.result) }); r.readAsDataURL(f);
  };
  return (
    <div className="space-y-1.5 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between"><span className="text-xs font-bold text-text-main">{label}{required && <b className="text-danger"> *</b>}</span>{hint && <span className="se-caption">{hint}</span>}</div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={gal} type="file" accept="image/*,application/pdf" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {value ? (
        <div className="flex items-center gap-3">
          {value.fileType.startsWith('image/') ? <img src={value.base64Data} alt={label} className="h-16 w-16 rounded-xl object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-xl bg-canvas"><FileText /></span>}
          <span className="min-w-0 flex-1 truncate text-caption text-text-secondary" dir="ltr">{value.fileName}</span>
          <button type="button" aria-label="حذف و بارگذاری مجدد" onClick={() => onChange(null)} className="grid h-10 w-10 cursor-pointer place-items-center rounded-full hover:bg-ink/10"><X size={16} /></button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" type="button" onClick={() => cam.current?.click()} ><Camera size={15} />دوربین</Button>
          <Button variant="outline" className="flex-1" type="button" onClick={() => gal.current?.click()} ><Paperclip size={15} />گالری / فایل</Button>
        </div>
      )}
      {err && <p role="alert" className="text-caption font-bold text-danger">{err}</p>}
    </div>
  );
}
