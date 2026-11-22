// Include the commercial terms shown to the approver. A client timestamp alone
// cannot identify the reviewed content because draft edits use client sync.
export async function quoteDecisionBasis(quote) {
  const terms=JSON.stringify([
    quote.status, quote.updatedAt ?? quote.createdAt, quote.accountId, quote.customerId,
    quote.ownerId, quote.lines, quote.totalAmount, quote.notes, quote.validUntil,
  ]);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(terms));
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
}
