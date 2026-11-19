/**
 * MotionListItem — lightweight shared-element friendly wrapper (2026)
 * Uses motion/react layoutId when provided so list → detail can morph.
 * Respects prefers-reduced-motion via CSS; keeps zero-clutter.
 */
import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

export function MotionListItem({
  layoutId,
  className,
  children,
  onClick,
  as: Comp = 'div',
}: {
  layoutId?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  as?: 'div' | 'button' | 'li';
}) {
  const reduce = useReducedMotion();
  const shared = {
    className: cn('se-soft-card se-pressable se-hover-lift', className),
    onClick,
    layoutId: reduce ? undefined : layoutId,
    transition: reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 },
  };

  if (Comp === 'button') {
    return (
      <motion.button type="button" {...shared}>
        {children}
      </motion.button>
    );
  }
  if (Comp === 'li') {
    return (
      <motion.li {...shared}>
        {children}
      </motion.li>
    );
  }
  return (
    <motion.div {...shared}>
      {children}
    </motion.div>
  );
}
