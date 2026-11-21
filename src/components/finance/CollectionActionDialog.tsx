import { useRef, useState } from 'react';
import { getActiveDataProvider, type CollectionActionInput } from '../../services/dataProvider';
import { getStateSyncEngine } from '../../services/stateSyncRuntime';
import { COLLECTION_PROMISE_SCHEMA } from '../../services/dynamicFormEngine';
import { toLatinDigits } from '../../lib/digits';
import { DynamicFormRenderer } from '../shared/DynamicFormRenderer';
import { BottomSheet } from '../ui/BottomSheet';
import type { CustomerCollectionProfile } from '../../services/collectionEngine';

const followUpSchema = {
  ...COLLECTION_PROMISE_SCHEMA, id: 'collection_follow_up',
  fields: COLLECTION_PROMISE_SCHEMA.fields.filter(field => ['promisedDate', 'negotiationNotes'].includes(field.name))
    .map(field => field.name === 'promisedDate' ? { ...field, label: 'تاریخ یادآوری در تقویم' } : field),
};

interface Props {
  profile: CustomerCollectionProfile;
  kind: CollectionActionInput['kind'];
  canCreateTask: boolean;
  onClose: () => void;
  onRecorded: (notice: string) => void;
}

export function CollectionActionDialog({ profile, kind, canCreateTask, onClose, onRecorded }: Props) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const requestId = useRef<string | null>(null);
  const promise = kind === 'PROMISE';
  const schema = promise && !canCreateTask ? { ...COLLECTION_PROMISE_SCHEMA,
    fields: COLLECTION_PROMISE_SCHEMA.fields.filter(field => field.name !== 'autoGenerateCalendarTask'),
  } : promise ? COLLECTION_PROMISE_SCHEMA : followUpSchema;

  async function submit(values: Record<string, unknown>) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await getActiveDataProvider().submitCollectionAction(profile.accountId, {
        requestId: requestId.current ??= crypto.randomUUID(),
        kind,
        dueDate: String(values.promisedDate ?? ''),
        note: String(values.negotiationNotes ?? ''),
        ...(promise ? {
          promisedAmount: Number(toLatinDigits(String(values.promisedAmount ?? '')).replace(/[\s,٬]/g, '')),
          paymentMethod: String(values.paymentMethod ?? ''),
          contactPerson: String(values.contactPerson ?? ''),
          sayadChequeNumber: String(values.sayadChequeNumber ?? ''),
          followUp: canCreateTask && values.autoGenerateCalendarTask === true,
        } : {}),
      });
      void getStateSyncEngine()?.hydrate().catch(() => {});
      onRecorded(promise ? 'تعهد مشتری ثبت شد. هنوز دریافتی مالی ثبت نشده است.' : 'وظیفهٔ پیگیری در تقویم ثبت شد.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تأیید ثبت دریافت نشد. دوباره تلاش کنید.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
    return false;
  }

  const dismiss = () => { if (!pending.current) onClose(); };
  return (
    <BottomSheet isOpen onClose={dismiss} title={promise ? 'ثبت تعهد پرداخت' : 'پیگیری در تقویم'} subtitle={profile.accountName}>
      <p className="mb-3 text-sm text-text-secondary">
        {promise ? 'این ثبت صرفاً وعدهٔ مشتری را ثبت می‌کند. ثبت دریافتی و تسویه مسیر جداگانه دارد.' : 'یادآوری برای خودتان در وظایف و تقویم ایجاد می‌شود.'}
      </p>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <DynamicFormRenderer schema={schema} onSubmit={submit} onCancel={dismiss}
        submitLabel={busy ? 'در حال ثبت…' : promise ? 'ثبت تعهد' : 'ایجاد یادآوری'} />
    </BottomSheet>
  );
}
