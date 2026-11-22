import { useRef, useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import { getActiveDataProvider } from '../../services/dataProvider';
import { advanceAccountingLabels, type AdvanceAccountingInput, type AdvanceAccountingRow, type AdvanceAccountingStage } from '../../services/personnelProfile';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';

const filters = [
  { value: 'ALL', label: 'همهٔ وضعیت‌ها' },
  ...Object.entries(advanceAccountingLabels).map(([value, label]) => ({ value, label })),
];
const decisions = [
  { value: 'READY_FOR_ERP', label: advanceAccountingLabels.READY_FOR_ERP },
  { value: 'ON_HOLD', label: advanceAccountingLabels.ON_HOLD },
];

export function AdvanceAccountingPanel({ focus }: { focus?: string }) {
  const [filter, setFilter] = useState<AdvanceAccountingStage | 'ALL'>(focus ? 'ALL' : 'AWAITING_REVIEW');
  const [page, setPage] = useState(1);
  const query = useDataQuery(async provider => ({
    filter, page, ...(await provider.listAdvanceAccounting(filter === 'ALL' ? '' : filter, page, focus)),
  }), [filter, page, focus]);
  const result = query.data?.page === page && query.data?.filter === filter ? query.data : null;
  const [row, setRow] = useState<AdvanceAccountingRow | null>(null);
  const [stage, setStage] = useState<AdvanceAccountingInput['stage']>('READY_FOR_ERP');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);

  async function submit() {
    if (!row || row.stage === 'READY_FOR_ERP' || inFlight.current) return;
    const body = { expectedStage: row.stage, stage, note: note.trim() };
    if (!body.note || stage === row.stage) {
      setError('وضعیت تازه و توضیح بررسی را وارد کنید.');
      return;
    }
    const key = JSON.stringify([row.id, body]);
    const commandId = attempt.current?.key === key ? attempt.current.id : crypto.randomUUID();
    attempt.current = { key, id: commandId };
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const receipt = await getActiveDataProvider().reviewAdvanceAccounting(row.id, { ...body, commandId });
      if (receipt.id !== row.id.toLowerCase()) throw new Error('رسید بررسی از سرور دریافت نشد.');
      setNotice('نتیجهٔ بررسی حسابداری ثبت شد.');
      setRow(null);
      attempt.current = null;
      await query.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نتیجهٔ بررسی ممکن نشد.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section aria-labelledby="advance-accounting-title">
    <Card className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id="advance-accounting-title" className="text-sm font-bold">مساعده‌های مصوب</h2>
          <p className="text-caption text-text-secondary">بررسی مقدماتی حسابداری پیش از اقدام در سامانهٔ مالی</p>
        </div>
        <SearchableSelect label="وضعیت بررسی" options={filters} value={filter} onChange={value => {
          setFilter(value as typeof filter);
          setPage(1);
        }} />
      </div>
      {notice && <p role="status" className="text-caption text-success">{notice}</p>}
      {query.loading && <p role="status" className="text-caption text-text-secondary">در حال دریافت مساعده‌ها…</p>}
      {query.error && <div className="space-y-2">
        <p role="alert" className="text-caption text-danger">{query.error.message}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>تلاش مجدد</Button>
      </div>}
      {!query.loading && !query.error && result && (result.items.length
        ? <ul className="divide-y divide-border">{result.items.map(item => (
          <li key={item.id} className={`flex flex-wrap items-start justify-between gap-2 rounded-lg py-2 ${item.id.toLowerCase() === focus ? 'bg-primary-soft px-2' : ''}`}>
            <div className="min-w-0 space-y-1 text-caption">
              <p className="font-semibold">{item.employee} · {formatDecimalString(item.amount)} ریال</p>
              <p className="text-text-secondary"><bdi>{item.number}</bdi> · تصویب {formatAppDate(item.approvedAt)}</p>
              <p>{advanceAccountingLabels[item.stage]}{item.reviewer && <> · {item.reviewer}</>}</p>
              {item.accountingNote && <p className="whitespace-pre-wrap wrap-break-word text-text-secondary">{item.accountingNote}</p>}
            </div>
            {item.stage !== 'READY_FOR_ERP' && <Button type="button" variant="outline" size="sm" onClick={() => {
              setRow(item); setStage('READY_FOR_ERP'); setNote(''); setError(''); setNotice('');
            }}>بررسی</Button>}
          </li>
        ))}</ul>
        : <EmptyState compact title="مساعده‌ای یافت نشد" description="درخواست‌های مصوب قابل بررسی با این وضعیت اینجا نمایش داده می‌شوند." />)}
      {(page > 1 || result?.hasMore) && <nav aria-label="صفحه‌بندی مساعده‌ها" className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={page === 1 || query.loading} onClick={() => setPage(current => current - 1)}>صفحهٔ قبل</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!result?.hasMore || query.loading} onClick={() => setPage(current => current + 1)}>صفحهٔ بعد</Button>
      </nav>}
    </Card>
    {row && <Modal isOpen size="sm" title="بررسی حسابداری مساعده" onClose={() => { if (!busy) setRow(null); }}>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <p className="text-sm font-semibold">{row.employee} · {formatDecimalString(row.amount)} ریال</p>
        <p className="text-caption text-text-secondary">ثبت این بررسی فقط وضعیت درخواست را تغییر می‌دهد. برای پرداخت از سامانهٔ مالی اقدام کنید.</p>
        <SearchableSelect label="نتیجهٔ بررسی" options={decisions.filter(option => option.value !== row.stage)} value={stage} disabled={busy}
          onChange={value => setStage(value as AdvanceAccountingInput['stage'])} />
        <Textarea label="توضیح بررسی" required rows={3} maxLength={1000} disabled={busy} value={note} onChange={event => setNote(event.target.value)} />
        {error && <p role="alert" className="text-caption text-danger">{error}</p>}
        <Button type="submit" loading={busy}>ثبت بررسی</Button>
      </form>
    </Modal>}
  </section>;
}
