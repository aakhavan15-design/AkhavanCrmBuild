// Published credit-note evidence only. Neither this projection nor the UI calculates a ledger balance.
export const CREDIT_NOTE_EVIDENCE_LIMIT = 25;

export const creditNoteEvidenceSql = `
  SELECT TOP (@take) credit.CreditNoteMirrorId AS id, credit.ExternalCreditNoteId AS externalId,
    credit.SourceSystemCode AS sourceSystemCode, CONVERT(char(10),credit.CreditDate,23) AS issuedOn,
    credit.StatusCode AS status, link.EvidenceCode AS evidence,
    CASE WHEN link.EvidenceCode='LINKED' THEN invoice.InvoiceNumber END AS invoiceNumber
  FROM crm.CreditNoteMirror AS credit
  LEFT JOIN crm.InvoiceMirror AS invoice
    ON invoice.TenantId=credit.TenantId AND invoice.InvoiceMirrorId=credit.InvoiceMirrorId
  LEFT JOIN crm.Account AS account
    ON account.TenantId=credit.TenantId AND account.AccountId=credit.AccountId
  CROSS APPLY (VALUES (CASE
    WHEN invoice.InvoiceMirrorId IS NULL THEN 'INVOICE_MISSING'
    WHEN credit.SourceSystemCode<>invoice.SourceSystemCode THEN 'SOURCE_MISMATCH'
    WHEN credit.AccountId IS NULL OR invoice.AccountId IS NULL THEN 'ACCOUNT_MISSING'
    WHEN credit.AccountId<>invoice.AccountId THEN 'ACCOUNT_MISMATCH'
    WHEN invoice.IsVoided=1 OR invoice.StatusCode IN ('VOID','VOIDED','CANCELLED','CANCELED') THEN 'INVOICE_VOID'
    ELSE 'LINKED'
  END)) AS link(EvidenceCode)
  WHERE credit.TenantId=@tenantId AND credit.IsVoided=0 AND credit.StatusCode IN ('POSTED','APPROVED')
    AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(
      credit.TenantId,N'finance.view',account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId
    ))
  ORDER BY credit.CreditDate DESC, credit.CreditNoteMirrorId DESC`;

export function projectCreditNoteEvidence(rows) {
  const items = rows.slice(0, CREDIT_NOTE_EVIDENCE_LIMIT);
  return { status: items.length ? 'AVAILABLE' : 'EMPTY', items, hasMore: rows.length > items.length };
}
