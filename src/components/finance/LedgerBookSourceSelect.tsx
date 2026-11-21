import { useDataQuery } from '../../hooks/useDataProvider';
import { useLedgerBookScope } from '../../hooks/useLedgerBookScope';
import { useDataSyncStatus } from '../../services/dataSyncController';
import { SearchableSelect } from '../ui/SearchableSelect';

export function LedgerBookSourceSelect({ viewer }: { viewer?: string | null }) {
  const {scope,select} = useLedgerBookScope();
  const {serverVersion} = useDataSyncStatus();
  const query = useDataQuery(async provider => ({ viewer, sources:(await provider.getLedgerSources()).items }),[viewer,serverVersion]);
  const items = query.data && query.data.viewer===viewer ? query.data.sources : [];
  if (query.loading || (!scope && items.length<=1)) return null;
  const key = (source: string, currency: string) => JSON.stringify([source,currency]);
  return <SearchableSelect label="دفتر شرکت و ارز پایه" value={scope ? key(scope.source,scope.currency) : ''}
    options={[{ value:'',label:'انتخاب دفتر شرکت' },...items.map(item => ({
      value:key(item.source,item.currency),label:`${item.title} · ${item.currency==='IRR' ? 'ریال' : item.currency}`,
    }))]} onChange={value => select(items.find(item => key(item.source,item.currency)===value))} />;
}
