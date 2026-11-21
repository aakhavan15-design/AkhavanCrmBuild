import { fixedUnits } from './financialFeedContract.mjs';
import { rebuildFifo } from './fifoInventory.mjs';
import { publishCalculatedFifo } from './fifoPublication.mjs';

const loadProducts = `
SELECT p.ExternalProductId AS [id],p.BaseUnitCode AS unit
FROM crm.ExternalProduct p
WHERE p.TenantId=@tenantId AND p.SourceSystemCode=@source
  AND EXISTS(SELECT 1 FROM OPENJSON(@ids) WHERE value=p.ExternalProductId);`;

export async function applyFifoFeed({ sql, transaction, tenantId, source, batchId, input, rows }) {
  const products = await new sql.Request(transaction).input('tenantId',sql.UniqueIdentifier,tenantId)
    .input('source',sql.VarChar(40),source)
    .input('ids',sql.NVarChar(sql.MAX),JSON.stringify(rows.map(row => row.productExternalId)))
    .query(loadProducts);
  const knownUnits = new Map(products.recordset.map(row => [row.id,row.unit]));
  const errors = [];
  const calculated = [];
  const reject = (externalId, ruleCode, messageFa) => errors.push({ externalId, ruleCode, severity: 'ERROR', messageFa });
  for (const product of rows) {
    const id = product.productExternalId;
    if (knownUnits.get(id)!==product.unitCode) {
      reject(id,'FIFO_BASE_UNIT_UNVERIFIED','کالا یا واحد پایهٔ منبع در آینهٔ CRM تأیید نشده است.');
      continue;
    }
    const result = rebuildFifo({ ...product, sourceSystemCode: source, currencyCode: input.currencyCode, sourceRevision: input.batchRevision });
    if (result.status!=='CALCULATED') {
      reject(id,result.issue.code,'گردش کالا با قرارداد FIFO سازگار نیست؛ شناسهٔ کالا و دسته به دادهٔ خام وصل‌اند.');
      continue;
    }
    const expected = new Map(product.control.closing.map(item => [item.warehouseId,fixedUnits(item.quantity,6)]));
    if (result.valuations.some(item => fixedUnits(item.quantity,6)!==expected.get(item.warehouseId))) {
      reject(id,'FIFO_CLOSING_UNRECONCILED','مقدار محاسبه‌شدهٔ پایان با شاهد مستقل ERP سازگار نیست.');
      continue;
    }
    calculated.push(result);
  }
  let inserted = 0, identical = 0;
  if (!errors.length) {
    for (const result of calculated) {
      const receipt = await publishCalculatedFifo(sql,transaction,tenantId,result,batchId);
      if (receipt.replayed) identical++;
      else inserted++;
    }
  }
  return { errors, stats: { inserted, identical, updated: 0, stale: 0 } };
}
