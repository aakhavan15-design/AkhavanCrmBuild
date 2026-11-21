import { useRef, useState } from 'react';
import { getActiveDataProvider } from '../../services/dataProvider';
import { getStateSyncEngine } from '../../services/stateSyncRuntime';
import { formatCount } from '../../lib/format';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Textarea } from '../ui/Input';

interface AccountItem { id: string; name: string }
interface Props {
  accounts: readonly AccountItem[];
  assignees: readonly AccountItem[];
  currentUserId: string;
  onClose: () => void;
  onComplete: (message: string) => void;
}

export function BatchCollectionFollowUp({ accounts, assignees, currentUserId, onClose, onComplete }: Props) {
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);
  const [successful, setSuccessful] = useState(0);
  const [failures, setFailures] = useState<Array<{ id: string; message: string }>>([]);
  const locked = useRef(false);
  const completed = useRef(new Set<string>());
  const requests = useRef(new Map<string, string>());
  const dateLabel = 'تاریخ پیگیری';
  const hasAttempted = requests.current.size > 0;

  const submit = async () => {
    if (locked.current || !dueDate || !assigneeId) return;
    locked.current = true;
    setBusy(true);
    setFailures([]);
    const errors: Array<{ id: string; message: string }> = [];
    try {
      const provider = getActiveDataProvider();
      for (const account of accounts) {
        if (completed.current.has(account.id)) continue;
        try {
          let requestId = requests.current.get(account.id);
          if (!requestId) { requestId = crypto.randomUUID(); requests.current.set(account.id, requestId); }
          await provider.submitCollectionAction(account.id, { requestId, kind: 'FOLLOW_UP', dueDate, note, assigneeId });
          completed.current.add(account.id);
          setSuccessful(completed.current.size);
        } catch (error) {
          errors.push({ id: account.id, message: error instanceof Error ? error.message : 'تأیید ثبت دریافت نشد.' });
        }
      }
      if (completed.current.size) void getStateSyncEngine()?.hydrate().catch(() => {});
      setFailures(errors);
      if (!errors.length) onComplete(`${formatCount(completed.current.size)} وظیفهٔ پیگیری با تأیید سرور ثبت شد.`);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const dismiss = () => { if (!locked.current) onClose(); };
  return <BottomSheet isOpen onClose={dismiss} title="ایجاد گروهی پیگیری وصول"
    subtitle={`${formatCount(accounts.length)} مشتری انتخاب شده‌اند`}
    footer={<div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="ghost" disabled={busy} onClick={dismiss}>بستن</Button>
      <Button type="button" disabled={!dueDate || !assigneeId || busy} onClick={() => void submit()}>
        {busy ? 'در حال ثبت…' : failures.length ? 'تلاش دوباره برای موارد تأییدنشده' : 'ایجاد وظایف پیگیری'}
      </Button>
    </div>}>
    <div className="space-y-3">
      {assignees.length > 1 ? <SearchableSelect label="مسئول پیگیری" value={assigneeId}
        onChange={setAssigneeId} disabled={hasAttempted || busy}
        options={assignees.map(user => ({ value: user.id, label: user.name }))} />
        : <p className="text-sm text-text-secondary">مسئول پیگیری: خودتان</p>}
      <fieldset disabled={hasAttempted || busy} className="space-y-2 disabled:opacity-70">
        <legend className="text-sm font-semibold">{dateLabel}</legend>
        <CustomDatePicker value={dueDate} onChange={setDueDate} calendarType="jalali" />
        <Textarea label="یادداشت پیگیری" value={note} onChange={event => setNote(event.target.value)} maxLength={2000} />
      </fieldset>
      {successful > 0 && <p role="status" className="text-sm text-success">{formatCount(successful)} وظیفه تأیید شده است.</p>}
      {failures.length > 0 && <ul role="alert" className="space-y-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
        {failures.map(failure => <li key={failure.id}><b>{accounts.find(account => account.id === failure.id)?.name}</b> · {failure.message}</li>)}
      </ul>}
    </div>
  </BottomSheet>;
}
