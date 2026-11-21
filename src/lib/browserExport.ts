/** Keep the object URL available until the browser has started the download. */
export function downloadCsv(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Print only the selected document. The rest of the authenticated UI stays out of the print tree. */
export function printDocument(documentView: HTMLElement | null) {
  if (!documentView) return;
  document.getElementById('crm-print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'crm-print-root';
  const clone = documentView.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  clone.removeAttribute('id');
  root.append(clone);
  document.body.append(root);
  const cleanup = () => { root.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(cleanup, 60_000);
  try { window.print(); } catch (error) { cleanup(); throw error; }
}
