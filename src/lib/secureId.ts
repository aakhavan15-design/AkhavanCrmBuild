/** Cryptographically strong persistent identifiers for client-side records. */
export function generateSecureId(prefix = 'id'): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random number generation is unavailable; cannot create a persistent identifier.');
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  const suffix = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${suffix}`;
}
