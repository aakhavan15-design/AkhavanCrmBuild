import { useSearchParams } from 'react-router-dom';
import type { LedgerBookScope } from '../services/officialLedger';

export function useLedgerBookScope() {
  const [params,setParams] = useSearchParams();
  const source = params.get('ledgerSource');
  const currency = params.get('ledgerCurrency');
  const scope: LedgerBookScope | undefined = source && currency ? { source,currency } : undefined;
  function select(next?: LedgerBookScope) {
    const updated = new URLSearchParams(params);
    updated.delete('ledgerSource');
    updated.delete('ledgerCurrency');
    if (next) {
      updated.set('ledgerSource',next.source);
      updated.set('ledgerCurrency',next.currency);
    }
    setParams(updated,{replace:true});
  }
  return {scope,select};
}
