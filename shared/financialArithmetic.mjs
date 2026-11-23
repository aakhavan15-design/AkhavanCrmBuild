/**
 * Shared financial arithmetic for browser and Node/ERP reports.
 * Only one implementation of gross - sales returns.
 * Inputs are trusted numeric IRR amounts, not raw ERP strings.
 */
export function calculateNetSalesCore(gross,returns) {
 if(typeof gross!=='number'||typeof returns!=='number'||
    !Number.isFinite(gross)||!Number.isFinite(returns)||
    gross<0||returns<0||
    Math.abs(gross)>Number.MAX_SAFE_INTEGER||
    Math.abs(returns)>Number.MAX_SAFE_INTEGER||
    Math.abs(gross-returns)>Number.MAX_SAFE_INTEGER) return null;
 return gross-returns;
}
