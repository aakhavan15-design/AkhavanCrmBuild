import { getHighValueQuoteThreshold, getChurnRiskPolicy } from '../lib/orgPolicy';
import { AppState, AIRecommendation } from '../types';
import { formatCurrency } from '../lib/utils';

export class AIAdvisorService {
  constructor(private state: AppState) {}

  /**
   * تشخیص ناهنجاری (Anomaly Detection) و تولید بینش هوشمند
   */
  generateRecommendations(): AIRecommendation[] {
    const recommendations: AIRecommendation[] = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date();

    const accounts = this.state.accounts || [];
    const quotes = this.state.quotes || [];

    // ۱. پایش ریزش مشتریان
    const churn = getChurnRiskPolicy(this.state);
    if (churn) {
      accounts.forEach(account => {
        const accQuotes = quotes.filter(q => q.accountId === account.id);
        if (accQuotes.length >= 2) {
          const totalSales = accQuotes.reduce((sum, q) => sum + q.totalAmount, 0);
          const sorted = [...accQuotes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const lastDate = new Date(sorted[0].createdAt);
          const daysSinceLastOrder = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));

          if (daysSinceLastOrder > churn.days && totalSales > churn.minSales) {
            recommendations.push({
              id: `rec-risk-${account.id}`,
              title: `ریزش احتمالی حساب کلیدی: ${account.name}`,
              customerId: account.id,
              category: 'CUSTOMER_RISK',
              reason: `این مشتری با ارزش تاریخی ${formatCurrency(totalSales)} ریال، بیش از ${daysSinceLastOrder} روز است سفارشی نداشته است.`,
              dataUsed: `آخرین تاریخ: ${sorted[0].createdAt}`,
              proposedAction: `تنظیم ویزیت حضوری یا ارائه پکیج Win-back`,
              actionPayload: { targetTab: 'accounts', customerId: account.id, actionType: 'PLAN_VISIT' },
              createdAt: todayStr
            });
          }
        }
      });
    }

    // ۲. پایش ناهنجاری روند فروش (Anomaly Detection)
    const recent30Days = quotes.filter(q => (today.getTime() - new Date(q.createdAt).getTime()) <= 30 * 86400000);
    const prev30Days = quotes.filter(q => {
      const diff = today.getTime() - new Date(q.createdAt).getTime();
      return diff > 30 * 86400000 && diff <= 60 * 86400000;
    });

    const recentRev = recent30Days.reduce((s, q) => s + q.totalAmount, 0);
    const prevRev = prev30Days.reduce((s, q) => s + q.totalAmount, 0);

    if (prevRev > 0 && recentRev < prevRev * 0.7) { // افت 30 درصدی
      recommendations.push({
        id: `rec-anomaly-sales`,
        title: `افت ناگهانی ۳۰ درصدی در فروش ماهانه`,
        customerId: 'SYSTEM',
        category: 'TREND_ANOMALY',
        reason: `درآمد ۳۰ روز گذشته (${formatCurrency(recentRev)} ریال) نسبت به ماه قبل (${formatCurrency(prevRev)} ریال) افت شدیدی داشته است.`,
        dataUsed: `مقایسه ۶۰ روزه پیش‌فاکتورها`,
        proposedAction: `بررسی عملکرد تیم فروش و کمپین‌های مارکتینگ`,
        actionPayload: { targetTab: 'reports', actionType: 'VIEW_SALES_REPORT' },
        createdAt: todayStr
      });
    }

    // ۳. فرصت‌های کلیدی در جریان
    (this.state.opportunities || []).filter(o => o.stage === 'NEGOTIATION' && o.amount > getHighValueQuoteThreshold(this.state)).forEach(opp => {
      recommendations.push({
        id: `rec-opp-${opp.id}`,
        title: `پیگیری فرصت استراتژیک: ${opp.title}`,
        customerId: opp.accountId,
        category: 'NEGOTIATION_DEAL',
        reason: `مذاکره با ارزش ${formatCurrency(opp.amount)} ریال در مرحله نهایی قرار دارد.`,
        dataUsed: `ارزش معامله: ${formatCurrency(opp.amount)} ریال`,
        proposedAction: `تخصیص سرپرست ارشد جهت نهایی‌سازی قرارداد`,
        actionPayload: { targetTab: 'opportunities', customerId: opp.accountId, actionType: 'CLOSE_DEAL' },
        createdAt: todayStr
      });
    });

    return recommendations;
  }
}
