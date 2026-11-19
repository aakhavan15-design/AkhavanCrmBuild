// Node >= 19 removed --experimental-specifier-resolution. This hook restores extensionless TS imports for tests only:
//   node --experimental-strip-types --import ./scripts/register-ts-resolver.mjs tests/x.test.mjs
import { register } from 'node:module';
register('./ts-resolver-hooks.mjs', import.meta.url);
