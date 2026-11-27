import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = file => readFileSync(resolve(root, file), 'utf8');

const empty = read('src/components/ui/EmptyState.tsx');
const loading = read('src/components/ui/LoadingState.tsx');
const skeleton = read('src/components/ui/Skeleton.tsx');
const index = read('src/components/ui/index.ts');
const dataTable = read('src/components/ui/DataTable.tsx');

for (const prop of [
  'icon?: React.ReactNode',
  'title: string',
  'description?: string',
  'actionLabel?: string',
  'onAction?: () => void',
  'secondaryActionLabel?: string',
  'onSecondaryAction?: () => void',
  'action?: React.ReactNode',
  'className?: string',
]) {
  assert.ok(empty.includes(prop), `EmptyState keeps legacy prop: ${prop}`);
}
assert.match(empty, /compact\?: boolean/, 'EmptyState adds compact mode');
assert.match(empty, /role="status"/);
assert.match(empty, /aria-live="polite"/);
assert.match(empty, /aria-atomic="true"/);
assert.match(empty, /dir="auto"/);
assert.match(empty, /export interface SkeletonProps/, 'legacy Skeleton API remains available');
assert.match(empty, /export const Skeleton: React\.FC<SkeletonProps>/, 'legacy Skeleton export remains available');
assert.match(empty, /export const CardSkeleton: React\.FC/, 'legacy CardSkeleton export remains available');
assert.match(empty, /cn\('se-skeleton'/, 'legacy Skeleton adapter uses the shared shimmer engine');
assert.match(empty, /bg-surface/);
assert.match(empty, /border-border/);
assert.match(empty, /bg-sunken/);
assert.match(empty, /\|\|\s*action\s*\)/, 'custom action renders independently');

assert.match(loading, /import \{ Skeleton \} from '\.\/Skeleton'/, 'LoadingState reuses the canonical Skeleton');
assert.match(loading, /Math\.min\(8, Math\.max\(1, Math\.floor\(lines\)\)\)/, 'line count is bounded');
assert.match(loading, /role="status"/);
assert.match(loading, /aria-live="polite"/);
assert.match(loading, /aria-busy="true"/);
assert.match(loading, /aria-hidden="true"/);
assert.match(loading, /bg-surface/);
assert.match(loading, /border-border/);
assert.match(skeleton, /se-skeleton/, 'existing skeleton engine remains intact');
assert.match(dataTable, /import \{ ErrorState \} from '\.\/Skeleton'/, 'DataTable error path remains intact');
assert.match(index, /export \* from '\.\/Skeleton'/, 'existing Skeleton exports remain intact');
assert.match(index, /export \{ LoadingState, CardSkeleton, type LoadingStateProps, type CardSkeletonProps \} from '\.\/LoadingState'/);

console.log('PASS: Phase 0.1 UI source contracts');
