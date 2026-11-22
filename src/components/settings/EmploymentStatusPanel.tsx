import { useRef, useState } from 'react';
import { formatAppDate } from '../../lib/utils';
import { getActiveDataProvider } from '../../services/dataProvider';
import { employmentStatusLabels, type EmploymentProfile, type EmploymentStatus } from '../../services/personnelProfile';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';

const allowed: Record<EmploymentStatus, readonly EmploymentStatus[]> = {
  ONBOARDING: ['PROBATION', 'TERMINATED'], PROBATION: ['ACTIVE', 'TERMINATED'],
  ACTIVE: ['SUSPENDED', 'TERMINATED'], SUSPENDED: ['ACTIVE', 'TERMINATED'], TERMINATED: [],
};

export function EmploymentStatusPanel({ profile, userId, viewer, onChanged }: {
  profile: EmploymentProfile; userId: string; viewer: string; onChanged: () => Promise<void>;
}) {
  const { employment, history, user } = profile;
  const [status, setStatus] = useState<EmploymentStatus | ''>('');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  if (!employment) return null;
  const options = userId !== viewer && employment.origin === 'LOCAL'
    ? (allowed[employment.employmentStatus] ?? []).map(value => ({ value, label: employmentStatusLabels[value] })) : [];

  async function save() {
    if (!employment || !status || !reason.trim() || !options.some(option => option.value === status) || inFlight.current) return;
    const body = { status, reason: reason.trim(), revision: employment.revision };
    const key = JSON.stringify([userId, body]);
    const commandId = attempt.current?.key === key ? attempt.current.id : crypto.randomUUID();
    attempt.current = { key, id: commandId };
    inFlight.current = true;
    setError('');
    setBusy(true);
    try {
      const receipt = await getActiveDataProvider().changeEmploymentStatus(userId, { ...body, commandId });
      if (receipt.userId !== userId.toLowerCase()) throw new Error('رسید تغییر از سرور دریافت نشد.');
      attempt.current = null;
      setOpen(false);
      setNotice('وضعیت استخدامی در پروندهٔ پرسنلی ثبت شد.');
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت وضعیت استخدامی ممکن نشد.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="space-y-2">
    {notice && <p role="status" className="text-caption text-success">{notice}</p>}
    {options.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => {
      setStatus(''); setReason(''); setError(''); setNotice(''); setOpen(true);
    }}>تغییر وضعیت همکاری</Button>}
    {!!history?.length && <details>
      <summary className="min-h-11 cursor-pointer py-2 text-caption font-semibold">تاریخچهٔ وضعیت همکاری</summary>
      <ul className="space-y-2 text-caption">{history.map(event => <li key={event.id} className="border-t border-border pt-2">
        <p>{employmentStatusLabels[event.previousStatus]} ← {employmentStatusLabels[event.status]}</p>
        <p className="text-text-secondary">{formatAppDate(event.at)}{event.actor && <> · {event.actor}</>}</p>
        <p className="whitespace-pre-wrap wrap-break-word">{event.reason}</p>
      </li>)}</ul>
    </details>}
    {open && <Modal isOpen size="sm" title="ثبت وضعیت همکاری" subtitle={user.name} onClose={() => { if (!busy) setOpen(false); }}>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
        <p className="text-caption text-text-secondary">این اقدام پروندهٔ استخدامی را به‌روزرسانی می‌کند. دسترسی حساب و امور حقوقی در فرآیندهای جداگانه مدیریت می‌شوند.</p>
        <SearchableSelect label="وضعیت جدید" value={status} options={options} disabled={busy} onChange={value => setStatus(value as EmploymentStatus)} />
        <Textarea label="دلیل تغییر" required maxLength={750} rows={3} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} />
        {error && <p role="alert" className="text-caption text-danger">{error}</p>}
        <Button type="submit" disabled={!status || !reason.trim()} loading={busy} variant={status === 'TERMINATED' ? 'danger' : 'primary'}>
          {status === 'TERMINATED' ? 'ثبت پایان همکاری' : 'ثبت تغییر وضعیت'}
        </Button>
      </form>
    </Modal>}
  </div>;
}
