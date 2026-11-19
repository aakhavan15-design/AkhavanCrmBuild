import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  UserPlus, 
  CheckSquare, 
  FileText, 
  Sparkles, 
  Briefcase, 
  DollarSign, 
  Send,
  MapPin,
  HelpCircle,
  TrendingUp
} from 'lucide-react';

export interface ContextualAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  primary?: boolean;
}

export interface ContextualQuickActionsProps {
  onOpenOcrIntake?: () => void;
  className?: string;
}

export function ContextualQuickActions({ onOpenOcrIntake, className = '' }: ContextualQuickActionsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const actions = useMemo<ContextualAction[]>(() => {
    // 1. سرنخ‌های فروش (Leads)
    if (path.startsWith('/leads')) {
      return [
        {
          id: 'add-lead',
          label: 'سرنخ جدید',
          icon: UserPlus,
          primary: true,
          onClick: () => {
            // ایجاد رویداد سفارشی یا هدایت با کوئری پارامتر
            window.dispatchEvent(new CustomEvent('akhavan-open-lead-modal'));
            navigate('/leads?new=1');
          }
        }
      ];
    }

    // 2. حساب‌ها و مشتریان (Accounts / Customers)
    if (path.startsWith('/accounts') || path.startsWith('/customers')) {
      return [
        {
          id: 'add-customer',
          label: 'مشتری جدید',
          icon: UserPlus,
          primary: true,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('akhavan-open-account-modal'));
            navigate('/accounts?new=1');
          }
        }
      ];
    }

    // 3. وظایف و پیگیری‌ها (Tasks)
    if (path.startsWith('/tasks')) {
      return [
        {
          id: 'add-task',
          label: 'وظیفه جدید',
          icon: CheckSquare,
          primary: true,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('akhavan-open-task-modal'));
            navigate('/tasks?new=1');
          }
        }
      ];
    }

    // 4. پیش‌فاکتورها و CPQ (Quotes)
    if (path.startsWith('/quotes')) {
      return [
        {
          id: 'add-quote',
          label: 'پیش‌فاکتور جدید',
          icon: FileText,
          primary: true,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('akhavan-open-quote-modal'));
            navigate('/quotes?new=1');
          }
        }
      ];
    }

    // 5. امور مالی و خزانه‌داری (Finance)
    if (path.startsWith('/finance')) {
      return [
        {
          id: 'add-payment',
          label: 'ثبت دریافتی',
          icon: DollarSign,
          primary: true,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('akhavan-open-payment-modal'));
          }
        }
      ];
    }

    // 6. فرصت‌ها و مذاکرات تجاری (Opportunities / Negotiations)
    if (path.startsWith('/opportunities') || path.startsWith('/negotiations')) {
      return [
        {
          id: 'add-opportunity',
          label: 'فرصت جدید',
          icon: TrendingUp,
          primary: true,
          onClick: () => {
            navigate('/negotiations?new=1');
          }
        }
      ];
    }

    // 7. اتوماسیون داخلی و درخواست‌ها (Internal Automation)
    if (path.startsWith('/internal_automation')) {
      return [
        {
          id: 'add-request',
          label: 'درخواست جدید',
          icon: Send,
          primary: true,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('akhavan-open-request-modal'));
          }
        }
      ];
    }

    // 8. هوش مکانی و زون‌بندی (Geo Intelligence)
    if (path.startsWith('/geo_intelligence')) {
      return [
        {
          id: 'add-zone',
          label: 'زون جدید',
          icon: MapPin,
          primary: true,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('akhavan-open-zone-modal'));
          }
        }
      ];
    }

    // مقدار پیش‌فرض در صفحه اصلی / داشبورد
    return [
      {
        id: 'quick-task',
        label: 'اقدام جدید',
        icon: Plus,
        primary: true,
        onClick: () => navigate('/tasks?new=1')
      }
    ];
  }, [path, navigate]);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            className={`h-8 px-2 sm:px-2.5 rounded-full flex items-center gap-1 font-bold active:scale-95 transition-all shadow-xs cursor-pointer shrink-0 ${
              action.primary
                ? 'bg-primary text-white hover:bg-primary-hover shadow-primary/20'
                : 'bg-surface hover:bg-canvas text-text-main border border-border'
            }`}
            title={action.label}
            aria-label={action.label}
          >
            <Icon size={14} className="shrink-0" />
            <span className="hidden sm:inline text-caption font-bold">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
