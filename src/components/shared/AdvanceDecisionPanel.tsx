/**
 * AdvanceDecisionPanel — مرکز تصمیم‌گیری مساعده: سابقه مالی/عملکردی + مبلغ پیشنهادی مدیر + تأیید/رد با ثبت Snapshot.
 * تأیید به معنی پرداخت نیست؛ پرداخت و سند رسمی در حسابداری/ERP انجام می‌شود.
 */
import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FinancialContextPanel } from './FinancialContextPanel';
import { decideAdvanceWithContext } from '../../lib/financialIntelligence';
import { withViewer } from '../../lib/financialAccess';
import { parsePersianNumber } from '../../lib/utils';
import type { AdvanceRequest, AppState } from '../../types';

export function AdvanceDecisionPanel({ advance, state, updateState, actorId, onResult }: {
  advance: AdvanceRequest; state: AppState; updateState: (u: (d: AppState) => AppState | void) => void; actorId?: string; onResult?: (msg: string, ok: boolean) => void;
}) {
  const [amount, setAmount] = useState(String(advance.requestedAmountRials));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = (decision: 'APPROVED' | 'REJECTED') => {
    if (busy) return; setBusy(true);
    let result: { ok: boolean; reason?: string } = { ok: false, reason: 'اجرا نشد.' };
    updateState(draft => { result = decideAdvanceWithContext(draft, advance.id, { decision, approvedAmountRials: parsePersianNumber(amount), note, actorId }, new Date(), withViewer(draft)); });
    setBusy(false);
    onResult?.(result.ok ? (decision === 'APPROVED' ? 'مساعده تأیید شد و تصویر لحظه‌ای اطلاعات زمان تصمیم ثبت شد. این تأیید پرداخت قطعی نیست.' : 'درخواست رد شد و تصویر لحظه‌ای ثبت شد.') : (result.reason || 'تصمیم ثبت نشد.'), result.ok);
  };
  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-border bg-canvas p-3" dir="rtl">
      <FinancialContextPanel approval={{ kind: 'ADVANCE_REQUEST', id: advance.id }} refreshKey={state.advanceRequests?.length} compact />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input label="مبلغ پیشنهادی مدیر (ریال)" value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" />
        <Input label="یادداشت (برای رد یا مبلغ کمتر الزامی)" value={note} onChange={e => setNote(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="danger" disabled={busy} onClick={() => decide('REJECTED')}>رد</Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => decide('APPROVED')}>تأیید با مبلغ پیشنهادی</Button>
      </div>
    </div>
  );
}
