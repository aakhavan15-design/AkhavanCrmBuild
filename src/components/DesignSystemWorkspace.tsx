import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { formatMoney, formatMoneyCompact } from '../lib/format';
import { Avatar, Badge, BottomSheet, Button, Card, Checkbox, CustomDatePicker, EmptyState, ErrorState, FilterChip, IconButton, Input, LoadingState, Modal, SearchableSelect, Select, StatusBadge, Switch, Textarea } from './ui';
import { DataTable, type DataTableColumn } from './ui/DataTable';

const exampleOptions = [
  { value: 'north', label: 'پشتیبانی شمال', keywords: '۱۰۱' },
  { value: 'west', label: 'گروه غرب', keywords: '۲۰۲' },
  { value: 'central', label: 'دفتر مرکزی', keywords: '۳۰۳' },
];
const exampleRows = [
  { id: 'sample-a', name: 'پروندهٔ با عنوان طولانی برای بررسی خوانایی در عرض کوچک', amount: 21_200_000_000 },
  { id: 'sample-b', name: 'پروندهٔ بدون مبلغ', amount: null },
];
const columns: DataTableColumn<typeof exampleRows[number]>[] = [
  { id: 'name', header: 'پرونده', primary: true, value: row => row.name },
  { id: 'amount', header: 'مبلغ', value: row => row.amount, render: row => <span title={formatMoney(row.amount)} className="tabular-nums">{formatMoneyCompact(row.amount)}</span> },
];

export function DesignSystemWorkspace() {
  const { theme, toggle } = useTheme();
  const [selection, setSelection] = useState('');
  const [date, setDate] = useState('');
  const [filtered, setFiltered] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [retried, setRetried] = useState(false);

  return (
    <div className="crm-page mx-auto max-w-5xl space-y-6 pb-24" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-main">سیستم طراحی</h1>
          <p className="mt-1 text-sm text-text-secondary">محیط توسعه برای بررسی مؤلفه‌ها، فوکوس و حالت‌های نمایشی.</p>
        </div>
        <Button type="button" variant="outline" onClick={toggle}>حالت {theme === 'dark' ? 'روشن' : 'تیره'}</Button>
      </header>

      <section aria-labelledby="design-controls" className="grid gap-3 sm:grid-cols-2">
        <Card padding="lg" className="space-y-4">
          <h2 id="design-controls" className="font-semibold text-text-main">کنترل‌های فرم</h2>
          <Input label="عنوان" placeholder="عنوان پرونده" />
          <Input label="شناسهٔ فنی" dir="ltr" placeholder="ID-204" />
          <Input label="مبلغ" error="مبلغ باید بزرگ‌تر از صفر باشد." aria-describedby="design-amount-unit" />
          <p id="design-amount-unit" className="text-xs text-text-secondary">واحد مبلغ ریال است.</p>
          <Textarea label="یادداشت" rows={3} />
        </Card>
        <Card padding="lg" className="space-y-4">
          <h2 className="font-semibold text-text-main">انتخاب و فیلتر</h2>
          <SearchableSelect label="گروه کاری" options={exampleOptions} value={selection} onChange={setSelection} />
          <Select label="ترتیب نمایش" defaultValue="recent"><option value="recent">جدیدترین</option><option value="name">نام پرونده</option></Select>
          <CustomDatePicker value={date} onChange={setDate} calendarType="jalali" />
          <div className="flex flex-wrap items-center gap-3">
            <FilterChip label="دارای مبلغ" active={filtered} onClick={() => setFiltered(value => !value)} />
            <label className="flex min-h-11 items-center gap-2"><Checkbox /> انتخاب</label>
            <label className="flex min-h-11 items-center gap-2"><Switch /> نمایش وضعیت</label>
          </div>
        </Card>
      </section>

      <DataTable tableId="design-system-samples" title="جدول و مبلغ" columns={columns}
        rows={filtered ? exampleRows.filter(row => row.amount !== null) : exampleRows}
        getRowId={row => row.id} />

      <section aria-labelledby="design-feedback" className="space-y-3">
        <h2 id="design-feedback" className="font-semibold text-text-main">اقدام و بازخورد</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setDialog(true)}>بازکردن پنجره</Button>
          <Button type="button" loading>ارسال</Button>
          <Button type="button" variant="outline" disabled>غیرفعال</Button>
          <IconButton type="button" aria-label="راهنمای پنجره" onClick={() => setDialog(true)}><CircleHelp size={18} /></IconButton>
          <Badge variant="info">اطلاع</Badge><StatusBadge status="PENDING" /><StatusBadge status="APPROVED" /><StatusBadge status="REJECTED" />
          <Avatar name="کاربر راهنما" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Card><LoadingState label="دریافت فهرست" /></Card>
          <Card><EmptyState title="نتیجه‌ای یافت نشد" description="جست‌وجو را تغییر دهید." /></Card>
          <Card>{retried ? <p role="status" className="text-sm text-text-secondary">تلاش مجدد انجام شد.</p> :
            <ErrorState title="دریافت اطلاعات ناموفق بود" description="دوباره تلاش کنید." onRetry={() => setRetried(true)} />}</Card>
        </div>
      </section>

      <Modal isOpen={dialog} onClose={() => setDialog(false)} title="بررسی پنجره" maxWidth="md">
        <SearchableSelect label="انتخاب در پنجره" options={exampleOptions} value={selection} onChange={setSelection} />
        <Button type="button" variant="secondary" onClick={() => setSheet(true)}>بازکردن پنل دوم</Button>
      </Modal>
      <BottomSheet isOpen={sheet} onClose={() => setSheet(false)} title="پنل دوم">
        <Textarea label="یادداشت پنل" rows={4} />
      </BottomSheet>
    </div>
  );
}
