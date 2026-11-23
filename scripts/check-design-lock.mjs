import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as ts from '@typescript/typescript6';

const migrationBaseline = '4a2119e11e2ecddced8fb0817000741cf7d03cfe';
const sourceRoots = ['src/components', 'src/workspaces', 'src/theme', 'src/index.css', 'index.html'];
const diff = execFileSync('git', ['diff', '--no-ext-diff', '--unified=0', process.env.UX_DESIGN_BASE || migrationBaseline,
  '--', ...sourceRoots], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const changed = new Map();
let file;
let line;
for (const row of diff.split('\n')) {
  if (row.startsWith('+++ ')) {
    file = row.startsWith('+++ b/') ? row.slice(6) : null;
    if (file && !changed.has(file)) changed.set(file, new Set());
  } else if (row.startsWith('@@')) {
    line = Number(/\+(\d+)/.exec(row)?.[1]);
  } else if (file && row.startsWith('+')) {
    changed.get(file).add(line++);
  }
}

const failures = new Set();
const docs = readFileSync('docs/DESIGN_SYSTEM_FA.md', 'utf8');
const exceptions = new Set([...docs.matchAll(/^\| (DS-[A-Z]+-[0-9]+) \|/gm)].map(match => match[1]));
const canonical = {
  FloatingHeader: 'src/components/header/FloatingHeader.tsx',
  NavigationDrawer: 'src/components/NavigationDrawer.tsx',
  DataTable: 'src/components/ui/DataTable.tsx',
  SearchableSelect: 'src/components/ui/SearchableSelect.tsx',
  PageToolbar: 'src/components/ui/PageToolbar.tsx',
};
const chrome = new Set(['src/components/header/FloatingHeader.tsx', 'src/components/NavigationDrawer.tsx']);
const colors = /(?:#[a-f\d]{3,8}\b|(?:rgb|hsl)a?\(\s*\d)/i;
const rawTerms = /^(?:CREATOR|MANAGER|SYSTEM|ERP|canonical|watermark|local source|DEMO|TEST|Seed)$/i;
const credentials = /\b(?:applyAccount\s*\(|VITE_ENABLE_DEMO_DATA\s*===\s*['"]true)/;

for (const [path, touched] of changed) {
  const input = readFileSync(path, 'utf8');
  const lines = input.split('\n');
  const issue = (index, rule, message) => {
    const current = lines[index - 1] || '';
    const previous = lines[index - 2] || '';
    const exception = /design-exception:(DS-[A-Z]+-[0-9]+)/.exec(current + '\n' + previous)?.[1];
    if (!exception || !exceptions.has(exception)) failures.add(`${path}:${index} ${rule} — ${message}`);
  };
  for (const added of touched) {
    const value = lines[added - 1] || '';
    if (path === 'index.html' && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i.test(value)) issue(added, 'UX-06', 'حفظ بزرگ‌نمایی و دسترسی ناوبری');
    if (path.endsWith('.css') && !path.startsWith('src/theme/') && !value.trimStart().startsWith('/*') && colors.test(value)) {
      issue(added, 'UX-13', 'رنگ را در توکن معنایی مرکزی تعریف کنید');
    }
    if (/font-size:\s*(?:[0-9]|1[0-5])px\b/i.test(value) && /(?:input|select|textarea)/i.test(value)) {
      issue(added, 'UX-10', 'اندازه ورودی موبایل را از قرارداد فیلد مشترک بگیرید');
    }
  }
  if (!path.endsWith('.tsx')) continue;
  const ast = ts.createSourceFile(path, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const addedLines = [...touched].sort((a, b) => a - b);
  const at = pos => ast.getLineAndCharacterOfPosition(pos).line + 1;
  function inspect(node) {
    const begin = at(node.getStart(ast));
    const end = at(node.getEnd());
    let low = 0;
    let high = addedLines.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (addedLines[mid] < begin) low = mid + 1;
      else high = mid;
    }
    const relevant = addedLines[low] <= end ? addedLines[low] : undefined;
    if (relevant) {
      const declaration = ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node);
      const name = declaration && node.name && ts.isIdentifier(node.name) ? node.name.text : '';
      if (Object.hasOwn(canonical, name) && canonical[name] !== path) {
        issue(begin, 'UX-13', `از ${canonical[name]} استفاده کنید`);
      }
      if (ts.isJsxText(node) && rawTerms.test(node.getText(ast).trim())) issue(begin, 'UX-03', 'از برچسب فارسی مرکزی استفاده کنید');
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'toLocaleString' && /['"]fa(?:-IR)?['"]/.test(node.getText(ast))) {
        issue(begin, 'UX-04', 'از Formatter مرکزی عدد، تاریخ یا پول استفاده کنید');
      }
      if (ts.isJsxAttribute(node) && ['className', 'style', 'fill', 'stroke', 'stopColor'].includes(node.name.getText(ast))
        && colors.test(node.getText(ast))) issue(relevant, 'UX-13', 'از توکن معنایی استفاده کنید');
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(ast);
        const attrs = node.attributes.getText(ast);
        if (tag === 'select' || (tag === 'Select' && ts.isJsxOpeningElement(node)
          && /\.map\s*\(/.test(node.parent.getText(ast)) && !path.endsWith('/WorkspaceViewSwitcher.tsx'))) {
          issue(begin, 'UX-09', 'از انتخابگر مشترک و برای دادهٔ پویا از Combobox استفاده کنید');
        }
        if (!chrome.has(path) && /^h(?:eader)$/.test(tag) && /(se-floating-header|se-island-header|data-app-header)/.test(attrs)) {
          issue(begin, 'UX-06', 'از FloatingHeader در Layout استفاده کنید');
        }
        if (!chrome.has(path) && /(?:href|to)=.*\bnew=1/.test(attrs)) {
          issue(begin, 'UX-01', 'مسیر ایجاد مستقل را در رجیستری + هدر تعریف کنید');
        }
        if (/aria-(?:label|description)\s*=/.test(attrs) && /\btruncate\b/.test(attrs)
          && /\b(?:alert|status)\b/.test(attrs) && !/\btitle\s*=/.test(attrs)) {
          issue(begin, 'UX-05', 'متن وضعیت یا هشدار باید کامل خوانده شود');
        }
      }
      if (ts.isIfStatement(node) && touched.has(begin) && credentials.test(node.expression.getText(ast))
        && !/import\.meta\.env\.DEV/.test(node.expression.getText(ast))) issue(begin, 'UX-02', 'عملیات آزمایشی محدود به DEV باشد');
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
}

if (failures.size) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log('Design System structural rules matched.');
}
