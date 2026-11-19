import assert from 'node:assert/strict';
import { auditSourceSurface } from '../scripts/audit-source-surface.mjs';
const report = auditSourceSurface();
assert.ok(report.sourceFiles > 0, 'source files are discovered');
assert.ok(report.reachableFiles > 0, 'main entry reaches application code');
assert.equal(report.sourceFiles, report.reachableFiles + report.unreachableCandidates, 'graph accounting reconciles');
assert.ok(report.method.includes('manual review'), 'static scan explicitly avoids claiming perfect dead-code detection');
console.log(`PASS: source surface audit (${report.sourceFiles} files, ${report.reachableFiles} reachable, ${report.unreachableCandidates} candidates)`);
