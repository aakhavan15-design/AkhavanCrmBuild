/**
 * WorkflowTimeline — visible circulation for tasks & org requests (2026)
 * Horizontal on desktop, vertical on mobile. Zero-clutter.
 */
import React from 'react';
import { Check, Circle, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TimelineNode {
  id: string;
  label: string;
  state: 'done' | 'active' | 'pending' | 'rejected';
  meta?: string;
  at?: string;
}

function formatAt(at?: string) {
  if (!at) return null;
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(at));
  } catch {
    return at.slice(0, 16);
  }
}

export function WorkflowTimeline({
  nodes,
  title = 'گردش کار',
  className,
  compact = false,
}: {
  nodes: TimelineNode[];
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  if (!nodes.length) return null;

  return (
    <div className={cn('rounded-xl border border-border bg-canvas/60 p-3', className)} dir="rtl">
      <div className="text-caption font-bold text-text-secondary mb-2.5">{title}</div>
      <ol className={cn('flex flex-col gap-0', !compact && 'sm:flex-row sm:items-start sm:gap-0')}>
        {nodes.map((node, index) => {
          const isLast = index === nodes.length - 1;
          const dot =
            node.state === 'done' ? (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-white shrink-0">
                <Check size={12} strokeWidth={3} />
              </span>
            ) : node.state === 'active' ? (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary shrink-0 ring-4 ring-primary/20">
                <Circle size={10} fill="currentColor" />
              </span>
            ) : node.state === 'rejected' ? (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white shrink-0">
                <X size={12} strokeWidth={3} />
              </span>
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-border bg-surface text-text-muted shrink-0">
                <Circle size={8} />
              </span>
            );

          return (
            <li
              key={node.id}
              className={cn(
                'flex gap-2.5 min-w-0',
                !compact && 'sm:flex-1 sm:flex-col sm:items-center sm:text-center sm:gap-1.5'
              )}
            >
              <div className={cn('flex flex-col items-center', !compact && 'sm:w-full')}>
                {dot}
                {!isLast && (
                  <div
                    className={cn(
                      'w-0.5 flex-1 min-h-(--size-16)',
                      !compact && 'sm:h-0.5 sm:w-full sm:min-h-0 sm:flex-none sm:mt-0',
                      node.state === 'done' ? 'bg-success/50' : 'bg-border'
                    )}
                  />
                )}
              </div>
              <div className={cn('pb-3 min-w-0', !compact && 'sm:pb-0 sm:px-1')}>
                <div
                  className={cn(
                    'text-label font-bold leading-tight',
                    node.state === 'active' && 'text-primary',
                    node.state === 'done' && 'text-text-main',
                    node.state === 'pending' && 'text-text-secondary',
                    node.state === 'rejected' && 'text-danger'
                  )}
                >
                  {node.label}
                </div>
                {node.meta && (
                  <div className="text-mini text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                    {node.meta}
                  </div>
                )}
                {formatAt(node.at) && (
                  <div className="text-micro text-text-muted mt-0.5 font-mono">{formatAt(node.at)}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
