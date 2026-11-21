#!/usr/bin/env bash
set -eu
node scripts/check-design-lock.mjs
report=$(mktemp)
trap 'rm -f "$report"' EXIT
test_status=0
node scripts/run-tests.mjs >"$report" 2>&1 || test_status=$?
node scripts/check-ux-quality.mjs "$report" "$test_status"
