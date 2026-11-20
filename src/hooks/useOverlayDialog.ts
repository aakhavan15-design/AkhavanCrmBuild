import { useEffect, useRef, type RefObject } from 'react';

const focusSelector = [
  'button', 'a[href]', 'input:not([type="hidden"])', 'select', 'textarea',
  '[tabindex]', '[contenteditable="true"]',
].join(',');
const dialogStack: HTMLElement[] = [];
let previousOverflow = '';

function focusableControls(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>(focusSelector)].filter(control =>
    control.tabIndex >= 0 && !control.matches(':disabled, [aria-disabled="true"]') &&
    !control.closest('[inert], [hidden], [aria-hidden="true"]') &&
    control.getClientRects().length > 0 && getComputedStyle(control).visibility === 'visible',
  );
}

/** Only the top dialog handles keyboard input. Nested dialogs share the same scroll lock. */
export function useOverlayDialog(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialogStack.length === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    dialogStack.push(dialog);

    const focusStart = () => (focusableControls(dialog)[0] ?? dialog).focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => {
      if (dialogStack.at(-1) === dialog && !dialog.contains(document.activeElement)) focusStart();
    });
    const viewport = window.visualViewport;
    let fieldFrame = 0;
    const keepFieldVisible = () => {
      if (!viewport || viewport.width >= 640 || Math.abs(viewport.scale - 1) >= 0.01 || window.innerHeight - viewport.height < 100) return;
      cancelAnimationFrame(fieldFrame);
      fieldFrame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (dialogStack.at(-1) !== dialog || !(field instanceof HTMLElement) || !dialog.contains(field) ||
          !field.matches('input:not([type=checkbox],[type=radio]),textarea,[contenteditable="true"]')) return;
        const area = field.closest<HTMLElement>('.crm-dialog-content');
        if (!area) return;
        const bounds = area.getBoundingClientRect();
        const actions = area.querySelector<HTMLElement>('.crm-form-actions');
        const visibleBottom = Math.min(bounds.bottom, actions?.getBoundingClientRect().top ?? bounds.bottom);
        const fieldBounds = field.getBoundingClientRect();
        if (fieldBounds.bottom > visibleBottom) area.scrollTop += fieldBounds.bottom - visibleBottom + 8;
        else if (fieldBounds.top < bounds.top) area.scrollTop += fieldBounds.top - bounds.top - 8;
      });
    };
    viewport?.addEventListener('resize', keepFieldVisible);
    dialog.addEventListener('focusin', keepFieldVisible);
    const handleKey = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialog || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusableControls(dialog);
      const first = controls[0];
      const last = controls.at(-1);
      const current = document.activeElement;
      if (!first || !last || !controls.includes(current as HTMLElement) || current === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last ?? dialog : first ?? dialog).focus();
      }
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(fieldFrame);
      viewport?.removeEventListener('resize', keepFieldVisible);
      dialog.removeEventListener('focusin', keepFieldVisible);
      document.removeEventListener('keydown', handleKey);
      const wasTop = dialogStack.at(-1) === dialog;
      const index = dialogStack.indexOf(dialog);
      if (index !== -1) dialogStack.splice(index, 1);
      const top = dialogStack.at(-1);
      if (!top) document.body.style.overflow = previousOverflow;
      if (!wasTop) return;
      if (trigger?.isConnected && (!top || top.contains(trigger))) trigger.focus({ preventScroll: true });
      else if (top) (focusableControls(top)[0] ?? top).focus({ preventScroll: true });
    };
  }, [open, ref]);
}
