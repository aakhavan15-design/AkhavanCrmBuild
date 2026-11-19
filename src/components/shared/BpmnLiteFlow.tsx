/**
 * BpmnLiteFlow — lightweight process diagram (2026)
 * Not full BPMN; visual lane of boxes + arrows for transparency.
 */
import React from 'react';
import { cn } from '../../lib/utils';
import type { TimelineNode } from './WorkflowTimeline';

export function BpmnLiteFlow({
  nodes,
  title = 'نمای فرآیند',
  className,
}: {
  nodes: TimelineNode[];
  title?: string;
  className?: string;
}) {
  if (!nodes.length) return null;

  return (
    <div className={cn('rounded-xl border border-border bg-surface p-3 overflow-x-auto', className)} dir="rtl">
      <div className="text-caption font-bold text-text-secondary mb-3">{title}</div>
      <div className="flex items-stretch gap-1 min-w-max pb-1">
        {nodes.map((node, index) => {
          const box =
            node.state === 'done'
              ? 'border-success/40 bg-success-soft/50 text-success'
              : node.state === 'active'
                ? 'border-primary/50 bg-primary-soft text-primary shadow-xs ring-2 ring-primary/15'
                : node.state === 'rejected'
                  ? 'border-danger/40 bg-danger-soft/50 text-danger'
                  : 'border-border bg-canvas text-text-secondary';

          return (
            <React.Fragment key={node.id}>
              <div
                className={cn(
                  'min-w-(--size-110) max-w-(--size-140) rounded-xl border px-2.5 py-2 flex flex-col justify-center',
                  box
                )}
              >
                <div className="text-micro font-bold opacity-70 mb-0.5">
                  {node.state === 'done' ? 'انجام‌شده' : node.state === 'active' ? 'جاری' : node.state === 'rejected' ? 'رد' : 'بعدی'}
                </div>
                <div className="text-label font-bold leading-snug">{node.label}</div>
                {node.meta && (
                  <div className="text-micro opacity-80 mt-1 line-clamp-2 leading-relaxed">{node.meta}</div>
                )}
              </div>
              {index < nodes.length - 1 && (
                <div className="flex items-center px-0.5 text-text-muted text-lg font-light" aria-hidden>
                  ←
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
