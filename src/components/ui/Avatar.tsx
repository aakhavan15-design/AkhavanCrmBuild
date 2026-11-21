import React from 'react';
import { Building2 } from 'lucide-react';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,var(--c-primary),var(--c-avatar-deep))', 'linear-gradient(135deg,var(--c-forest-light),var(--c-forest-dark))',
  'linear-gradient(135deg,var(--c-navy-light),var(--c-primary))', 'linear-gradient(135deg,var(--c-accent),var(--c-copper))',
  'linear-gradient(135deg,var(--c-ink-muted),var(--c-avatar-deep))', 'linear-gradient(135deg,var(--c-forest),var(--c-avatar-deep))',
];

interface AvatarProps {
  name: string;
  src?: string;
  entity?: 'person' | 'company';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, src, entity = 'person', size = 'md', className = '' }) => {
  const meaningfulWord = (name || '').trim().split(/\s+/).find(word =>
    /\p{L}/u.test(word) && !['آقای', 'خانم', 'جناب', 'سرکار', 'دکتر', 'مهندس'].includes(word));
  const initial = Array.from(meaningfulWord || 'ک').find(letter => /\p{L}/u.test(letter)) || 'ک';
  const hue = AVATAR_GRADIENTS[[...(name || 'ک')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length];
  
  const sizeClasses = {
    xs: 'w-6 h-6 text-micro',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size];

  if (src) {
    return <img src={src} alt={name} loading="lazy" draggable={false} className={`rounded-full object-cover select-none shadow-xs ${sizeClasses} ${className}`} />;
  }

  return (
    <div 
      style={{ background: hue }}
      className={`rounded-full text-white flex items-center justify-center font-extrabold select-none shadow-xs ${sizeClasses} ${className}`}
    >
      {entity === 'company' ? <Building2 className="h-1/2 w-1/2" aria-hidden /> : initial}
    </div>
  );
};

export const AvatarGroup: React.FC<{ users?: { name: string }[]; size?: 'xs' | 'sm' | 'md'; max?: number }> = ({
  users = [],
  size = 'xs',
  max = 3,
}) => {
  const visible = users.slice(0, max);
  const remaining = users.length - max;

  return (
    <div className="flex items-center -space-x-1.5 space-x-reverse" dir="rtl">
      {visible.map((u, i) => (
        <Avatar key={i} name={u.name} size={size} className="border-2 border-white" />
      ))}
      {remaining > 0 && (
        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-nano font-bold flex items-center justify-center border-2 border-white">
          +{remaining}
        </div>
      )}
    </div>
  );
};
