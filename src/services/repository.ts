import { getActiveDataProvider, DataProvider, PaginatedResult } from './dataProvider';
import type { Account, Quote, Task, Invoice, Payment, Cheque, Payslip, AdvanceRequest, GeoZone } from '../types';

/**
 * مخزن متمرکز مشتریان و طرف‌های حساب
 */
export const AccountRepository = {
  get provider(): DataProvider { return getActiveDataProvider(); },
  
  async list(filter?: unknown, page = 1, pageSize = 25): Promise<PaginatedResult<Account>> {
    return this.provider.getAccounts(filter, { page, pageSize });
  },
  
  async findById(id: string): Promise<Account | null> {
    return this.provider.getAccountById(id);
  },
  
  async create(data: Partial<Account>, idempotencyKey?: string): Promise<Account> {
    return this.provider.createAccount(data, idempotencyKey);
  },
  
  async update(id: string, patch: Partial<Account>): Promise<Account> {
    return this.provider.updateAccount(id, patch);
  }
};

/**
 * مخزن متمرکز سفارش‌ها و پیش‌فاکتورهای CPQ
 */
export const QuoteRepository = {
  get provider(): DataProvider { return getActiveDataProvider(); },
  
  async list(page = 1, pageSize = 25): Promise<PaginatedResult<Quote>> {
    return this.provider.getQuotes(undefined, { page, pageSize });
  },
  
  async findById(id: string): Promise<Quote | null> {
    return this.provider.getQuoteById(id);
  },
  
  async create(data: Partial<Quote>, idempotencyKey?: string): Promise<Quote> {
    return this.provider.createQuote(data, idempotencyKey);
  },
  
  async update(id: string, patch: Partial<Quote>): Promise<Quote> {
    return this.provider.updateQuote(id, patch);
  }
};

/**
 * مخزن متمرکز وظایف و تریاژ
 */
export const TaskRepository = {
  get provider(): DataProvider { return getActiveDataProvider(); },
  
  async list(page = 1, pageSize = 25): Promise<PaginatedResult<Task>> {
    return this.provider.getTasks(undefined, { page, pageSize });
  },
  
  async findById(id: string): Promise<Task | null> {
    return this.provider.getTaskById(id);
  },
  
  async create(data: Partial<Task>, idempotencyKey?: string): Promise<Task> {
    return this.provider.createTask(data, idempotencyKey);
  },
  
  async update(id: string, patch: Partial<Task>): Promise<Task> {
    return this.provider.updateTask(id, patch);
  }
};

/**
 * مخزن متمرکز اسناد مالی و دریافت‌ها
 */
export const FinanceRepository = {
  get provider(): DataProvider { return getActiveDataProvider(); },
  
  async listInvoices(): Promise<PaginatedResult<Invoice>> {
    return this.provider.getInvoices();
  },
  
  async listPayments(): Promise<PaginatedResult<Payment>> {
    return this.provider.getPayments();
  },
  
  async listCheques(): Promise<PaginatedResult<Cheque>> {
    return this.provider.getCheques();
  },
  
  async submitPayment(payment: Partial<Payment>, idempotencyKey?: string): Promise<Payment> {
    return this.provider.createPayment(payment, idempotencyKey);
  }
};

/**
 * مخزن متمرکز منابع انسانی و حقوق
 */
export const PayrollRepository = {
  get provider(): DataProvider { return getActiveDataProvider(); },
  
  async getPayslips(userId?: string, month?: string): Promise<Payslip[]> {
    return this.provider.getPayslips(userId, month);
  },
  
  async getAdvances(userId?: string): Promise<AdvanceRequest[]> {
    return this.provider.getAdvanceRequests(userId);
  },
  
  async requestAdvance(req: Partial<AdvanceRequest>): Promise<AdvanceRequest> {
    return this.provider.createAdvanceRequest(req);
  },
  
  async runPayroll(month: string, basis = 30) {
    return this.provider.executePayrollRun(month, basis);
  }
};
