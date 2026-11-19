import React from 'react';
import { Quote, AppState, Payslip, UserAccount, SalaryProfile } from '../types';
import { formatCurrency, formatAppDate } from '../lib/utils';
import { getTenantName } from '../lib/orgPolicy';
import { Printer } from 'lucide-react';
import { Button } from './ui/Button';

interface PrintProps {
  quote?: Quote;
  payslip?: Payslip;
  user?: UserAccount;
  salaryProfile?: SalaryProfile;
  state: AppState;
}

export function CustomerInvoicePrint({ quote, state }: PrintProps) {
  if (!quote) return null;
  const customer = (state.accounts || state.customers || []).find(
    a => a.id === (quote.accountId || quote.customerId)
  );

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 text-xs space-y-4" dir="rtl" id="print-area-invoice">
      <div className="flex justify-between items-start border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-base font-black text-text-main">پیش‌فاکتور رسمی فروش کالا و خدمات</h2>
          <span className="text-caption text-slate-500 font-bold block mt-1">{getTenantName(state) ? `${getTenantName(state)} · ` : ''}AKHAVAN CRM</span>
        </div>
        <div className="text-left font-mono text-caption">
          <div>شماره: <span className="font-bold text-primary">{quote.quoteNumber}</span></div>
          <div className="text-slate-400 mt-1">تاریخ: {formatAppDate(quote.createdAt, state.settings?.locale)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
        <div>
          <span className="text-slate-400 text-micro block font-bold">مشخصات خریدار:</span>
          <strong className="text-slate-900 block mt-0.5">{customer?.name || 'مشتری محترم'}</strong>
          <span className="text-slate-500 text-caption block">{customer?.company || ''} - {customer?.phone || ''}</span>
        </div>
        <div className="text-left">
          <span className="text-slate-400 text-micro block font-bold">آدرس و نشانی تحویل:</span>
          <span className="text-slate-700 text-caption block mt-0.5">{customer?.address || 'تحویل انبار مرکزی'}</span>
        </div>
      </div>

      <table className="w-full text-right border border-slate-200 rounded-xl overflow-hidden">
        <thead className="bg-slate-100/80 text-caption font-bold text-slate-600">
          <tr>
            <th className="p-2.5">ردیف</th>
            <th className="p-2.5">شرح کالا / خدمات</th>
            <th className="p-2.5 text-center">تعداد</th>
            <th className="p-2.5 text-center">قیمت واحد (ریال)</th>
            <th className="p-2.5 text-center">مبلغ کل (ریال)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(quote.lines || []).map((l: unknown, idx: number) => (
            <tr key={idx}>
              <td className="p-2 text-slate-400 text-center font-mono">{idx + 1}</td>
              <td className="p-2 font-bold text-slate-800">{l.productName || l.description || 'کالا/خدمت'}</td>
              <td className="p-2 text-center font-mono">{l.quantity}</td>
              <td className="p-2 text-center font-mono font-bold">{(l.unitPrice || 0).toLocaleString('fa-IR')}</td>
              <td className="p-2 text-center font-mono font-bold text-primary">{(l.lineTotal || 0).toLocaleString('fa-IR')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between items-center bg-primary/5 border border-primary/20 p-3.5 rounded-xl">
        <span className="font-bold text-slate-800">مبلغ نهایی قابل پرداخت:</span>
        <span className="font-mono font-black text-base text-primary">
          {(quote.totalAmount || 0).toLocaleString('fa-IR')} ریال
        </span>
      </div>

      {quote.notes && (
        <div className="text-micro text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <strong>توضیحات و شرایط: </strong> {quote.notes}
        </div>
      )}

      <div className="pt-2 text-center print:hidden">
        <Button variant="primary" onClick={() => window.print()} >
          <Printer className="w-4 h-4" /> چاپ پیش‌فاکتور رسمی (A4)
        </Button>
      </div>
    </div>
  );
}

export function PayslipPrint({ payslip, user, salaryProfile, state }: PrintProps) {
  if (!payslip || !user) return null;

  const earnings = payslip.lines.filter(l => l.isCredit);
  const deductions = payslip.lines.filter(l => !l.isCredit);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 text-xs space-y-5" dir="rtl" id="print-area-payslip">
      {/* هدر فیش حقوقی */}
      <div className="flex justify-between items-start border-b border-slate-400 pb-4">
        <div>
          <h2 className="text-lg font-black text-text-main">فیش حقوق و دستمزد پرسنل</h2>
          <span className="text-xs text-slate-600 font-bold block mt-1">{getTenantName(state) || 'گروه صنعتی اخوان'}</span>
        </div>
        <div className="text-left">
          <div className="font-bold text-sm bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">دوره: {payslip.month}</div>
          <div className="text-slate-500 mt-2 text-micro font-mono">تاریخ صدور: {formatAppDate(payslip.calculatedAt, state.settings?.locale)}</div>
        </div>
      </div>

      {/* اطلاعات پرسنلی */}
      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="space-y-2">
          <div className="flex gap-2"><span className="text-slate-500 w-24">نام و نام خانوادگی:</span><strong className="text-slate-900">{user.name}</strong></div>
          <div className="flex gap-2"><span className="text-slate-500 w-24">کد پرسنلی:</span><strong className="text-slate-900 font-mono">{user.employeeCode || user.username}</strong></div>
          <div className="flex gap-2"><span className="text-slate-500 w-24">سمت سازمانی:</span><strong className="text-slate-900">{user.jobTitle || 'کارشناس'}</strong></div>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2"><span className="text-slate-500 w-24">مبنای کارکرد:</span><strong className="text-slate-900 font-mono">{payslip.workedDays} از {payslip.dailyBasis} روز</strong></div>
          <div className="flex gap-2"><span className="text-slate-500 w-24">ساعات اضافه‌کار:</span><strong className="text-slate-900 font-mono">{payslip.approvedOvertimeHours} ساعت</strong></div>
          <div className="flex gap-2"><span className="text-slate-500 w-24">غیبت / کسر کار:</span><strong className="text-slate-900 font-mono text-danger">{payslip.unexcusedAbsenceDays} روز / {payslip.delayMinutes} دقیقه</strong></div>
        </div>
      </div>

      {/* جدول کسورات و مزایا */}
      <div className="grid grid-cols-2 gap-4">
        {/* ستون مزایا */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-100 p-2 text-center font-bold text-slate-700 border-b border-slate-200">حقوق و مزایا (ریال)</div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {earnings.map((e, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-2 text-slate-700">{e.title}</td>
                  <td className="p-2 text-left font-mono font-bold">{formatCurrency(e.amountRials)}</td>
                </tr>
              ))}
              {earnings.length === 0 && <tr><td colSpan={2} className="p-4 text-center text-slate-400">موردی یافت نشد</td></tr>}
            </tbody>
          </table>
          <div className="bg-slate-50 p-2 flex justify-between border-t border-slate-200 font-bold">
            <span>جمع مزایا:</span>
            <span className="font-mono text-success">{formatCurrency(payslip.grossPayRials)}</span>
          </div>
        </div>

        {/* ستون کسورات */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-100 p-2 text-center font-bold text-slate-700 border-b border-slate-200">کسورات (ریال)</div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {deductions.map((d, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-2 text-slate-700">{d.title}</td>
                  <td className="p-2 text-left font-mono font-bold text-danger">{formatCurrency(d.amountRials)}</td>
                </tr>
              ))}
              {deductions.length === 0 && <tr><td colSpan={2} className="p-4 text-center text-slate-400">کسوراتی ثبت نشده است</td></tr>}
            </tbody>
          </table>
          <div className="bg-slate-50 p-2 flex justify-between border-t border-slate-200 font-bold">
            <span>جمع کسورات:</span>
            <span className="font-mono text-danger">{formatCurrency(payslip.totalDeductionsRials)}</span>
          </div>
        </div>
      </div>

      {/* خالص پرداختی */}
      <div className="flex justify-between items-center bg-slate-100 border-2 border-slate-300 p-4 rounded-xl">
        <span className="font-black text-sm text-slate-800">خالص پرداختی:</span>
        <span className="font-mono font-black text-xl text-text-main">
          {formatCurrency(payslip.netPayableRials)} <span className="text-xs font-normal">ریال</span>
        </span>
      </div>

      {/* امضا */}
      <div className="grid grid-cols-2 mt-8 pt-8">
        <div className="text-center text-slate-500 font-bold">مهر و امضای امور مالی</div>
        <div className="text-center text-slate-500 font-bold">امضای پرسنل</div>
      </div>

      <div className="pt-4 text-center print:hidden">
        <Button variant="primary" onClick={() => window.print()} >
          <Printer className="w-4 h-4" /> چاپ فیش حقوقی (A4)
        </Button>
      </div>
    </div>
  );
}
