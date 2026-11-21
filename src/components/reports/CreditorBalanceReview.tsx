import type { Account } from '../../types';
import { resolveCustomerBalanceView, type DetailBalancesResult, type SubsidiaryBalance } from '../../lib/receivableReconciliation';
import { formatCount, formatNumber } from '../../lib/format';
import { DataTable, DetailGroup, type DataTableColumn } from '../ui/DataTable';
import { SubsidiaryBalanceDetails } from '../shared/SubsidiaryBalancesPanel';

interface Row {
  accountId: string;
  name: string;
  detailKey: string;
  balances: SubsidiaryBalance[];
  amount: number;
}

const columns: DataTableColumn<Row>[] = [
  { id: 'customer', header: 'مشتری', value: row => row.name, primary: true },
  { id: 'detail', header: 'کد تفصیلی', value: row => row.detailKey, render: row => <bdi>{row.detailKey}</bdi> },
  { id: 'amount', header: 'جمع مانده‌های بستانکار (ریال)', value: row => row.amount,
    render: row => formatNumber(row.amount) },
  { id: 'coverage', header: 'ترکیب معین و دوره', value: row => row.balances.length,
    render: row => formatCount(row.balances.length) },
];

export function CreditorBalanceReview({ accounts, ledger, locale }: {
  accounts: readonly Account[];
  ledger: DetailBalancesResult;
  locale?: unknown;
}) {
  const rows = accounts.flatMap((account): Row[] => {
    const view = resolveCustomerBalanceView(ledger, account);
    if (view.kind !== 'OK') return [];
    const balances = view.subsidiaries.filter(row => row.subsidiaryCode && row.balance < 0);
    if (!balances.length) return [];
    return [{ accountId: account.id, name: account.name, detailKey: view.detailKey, balances,
      amount: balances.reduce((sum, row) => sum + Math.abs(row.balance), 0) }];
  });
  return (
    <DataTable tableId="ledger-creditor-review" title="پایش مانده‌های بستانکار مشتریان"
      subtitle="مانده‌های بستانکار هر معین و دوره جداگانه بررسی می‌شوند. تشخیص علت به سند مرتبط نیاز دارد."
      rows={rows} getRowId={row => row.accountId} columns={columns}
      defaultSort={{ columnId: 'amount', direction: 'desc' }}
      exportFileName="ledger_creditor_balances"
      emptyTitle="ماندهٔ بستانکارِ دارای معین یافت نشد"
      emptyDescription="فقط اسناد دفتر کل در محدودهٔ دسترسی و سطرهای دارای کد معین بررسی شده‌اند."
      renderDetail={row => <DetailGroup title="گردش معین و دوره">
        <SubsidiaryBalanceDetails detailKey={row.detailKey} rows={row.balances} byPeriod locale={locale} />
      </DetailGroup>}
      detailTitle={row => row.name} />
  );
}
