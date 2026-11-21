import { useDataQuery } from '../../hooks/useDataProvider';
import { formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import type { InvoiceFifoRow } from '../../services/dataProvider';
import { BottomSheet } from '../ui/BottomSheet';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { ErrorState, LoadingState } from '../ui';
import { KpiCard } from '../charts/KpiCard';

const labels: Record<InvoiceFifoRow['coverage'], string> = {
  MATCHED: 'مقدار و بهای ردیف منطبق‌اند',
  UNMAPPED_LINE: 'نگاشت کالا، واحد یا مقدار نامعتبر',
  NO_CONSUMPTION: 'برداشت منتشرشده یافت نشد',
  OVERLAP: 'دوره‌های محاسبه هم‌پوشانی دارند',
  QUANTITY_MISMATCH: 'مقدار برداشت و فاکتور متفاوت است',
  RETURN_REVIEW: 'برگشت ثبت شده و نیازمند تطبیق است',
  COST_UNAVAILABLE: 'مبلغ بها قابل محاسبه نیست',
};

const decimal = (value: string | null) => value === null ? 'نامشخص' : formatDecimalString(value);
const marginPending={RETURN_REVIEW:'برگشت مرتبط باید با فروش و بهای برگشتی تطبیق داده شود.',
  INCOMPLETE:'پوشش بهای تمام ردیف‌ها کامل نیست.',NET_MISMATCH:'جمع فروش خالص ردیف‌ها با خالص فاکتور تطبیق ندارد.'};
const columns: DataTableColumn<InvoiceFifoRow>[] = [
  { id: 'line', header: 'کالا و ردیف', primary: true, value: row => row.name,
    render: row => <span className="block wrap-break-word">{row.name}<bdi className="block text-caption text-text-secondary">{row.lineId}</bdi></span> },
  { id: 'quantity', header: 'مقدار فاکتور', value: row => row.quantity, sortable: false,
    render: row => <>{decimal(row.quantity)} <bdi>{row.unit}</bdi></> },
  { id: 'net', header: 'فروش خالص ردیف', value: row => row.revenue, sortable: false, render: row => decimal(row.revenue) },
  { id: 'cost', header: 'بهای تحلیلی ردیف', value: row => row.cost, sortable: false, render: row => decimal(row.cost) },
  { id: 'gross', header: 'سود ناخالص ردیف', value: row => row.grossProfit, sortable: false, render: row => decimal(row.grossProfit) },
  { id: 'through', header: 'تاریخ پایان پوشش', value: row => row.through, mobile: 'hide',
    render: row => row.through ? formatAppDate(row.through) : 'نامشخص' },
  { id: 'evidence', header: 'وضعیت شواهد', value: row => labels[row.coverage] },
];

export function InvoiceFifoSheet({ invoiceId, invoiceNumber, locale, onClose }: {
  invoiceId: string;
  invoiceNumber?: string;
  locale?: unknown;
  onClose: () => void;
}) {
  const { data, loading, error, refetch } = useDataQuery(provider => provider.getInvoiceFifoEvidence(invoiceId), [invoiceId]);
  const hasRows = data?.status === 'AVAILABLE';
  const summary=data?.margin;
  return <BottomSheet isOpen onClose={onClose} title="شواهد بهای تمام‌شده" subtitle={invoiceNumber ? `فاکتور ${invoiceNumber}` : undefined}>
    {loading ? <LoadingState label="در حال دریافت شواهد فاکتور" />
      : error || !data || data.status === 'UNAVAILABLE' ? (
        <ErrorState surface="invoice_fifo" title="دریافت شواهد فاکتور ممکن نیست" onRetry={() => void refetch()} />
      ) : data.status === 'RESTRICTED' ? (
        <p role="status" className="p-3 text-sm text-text-secondary">ریز بهای تمام‌شده به مجوز مالی در سطح سازمان نیاز دارد.</p>
      ) : data.status === 'UNMAPPED' || data.status === 'AMBIGUOUS' ? (
        <p role="status" className="p-3 text-sm text-text-secondary">برای این شناسه، فاکتور قطعی و یکتا در آینهٔ ERP پیدا نشد.</p>
      ) : <>
        <p className="mb-2 text-caption text-text-secondary">
          فاکتور <bdi>{data.invoice?.number}</bdi> · {formatAppDate(data.invoice?.date, locale)} ·
          {' '}مبالغ به {data.invoice?.currency === 'IRR' ? 'ریال' : <bdi>{data.invoice?.currency}</bdi>}
        </p>
        {summary?.status==='AVAILABLE' ? <div className="mb-3 grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">
          <KpiCard density="compact" label="فروش خالص" value={decimal(summary.net)} />
          <KpiCard density="compact" label="بهای تمام‌شدهٔ FIFO" value={decimal(summary.cost)} />
          <KpiCard density="compact" label="سود تجاری" value={decimal(summary.profit)} />
          <KpiCard density="compact" label="حاشیهٔ سود تجاری" value={summary.percent===null ? 'نامشخص' : `${decimal(summary.percent)}٪`} />
        </div> : summary && <p role="status" className="mb-2 rounded-xl border border-warning/30 bg-warning-soft p-2 text-caption text-warning">سود کل فاکتور نامشخص است. {marginPending[summary.status]}</p>}
        <p className="mb-2 text-caption text-text-secondary">مبنای سود تجاری، فروش خالص و بهای معتبر کالاست. تحلیل هزینهٔ حمل و توزیع در گزارش هزینه‌های عملیاتی انجام می‌شود.</p>
        {data.hasMore && <p role="status" className="mb-2 text-caption text-warning">نمایش به نخستین ۲۵۰ ردیف محدود است.</p>}
        <DataTable tableId="invoice-fifo-evidence" title="ردیف‌های فاکتور" rows={data.rows} columns={columns}
          getRowId={row => row.lineId} exportFileName="invoice_fifo_evidence"
          emptyTitle={hasRows ? 'ردیفی یافت نشد' : 'فاکتور در آینهٔ ERP ردیف قابل نمایش ندارد'}
          emptyDescription="پس از دریافت ردیف‌های رسمی، تطبیق بهای تمام‌شده در همین نما انجام می‌شود." />
      </>}
  </BottomSheet>;
}
