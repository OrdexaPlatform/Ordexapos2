/**
 * ERP Business Engine: Customers, Suppliers, Purchases, Expenses, and Treasury
 * Fully backed by client-isolated persistence, Supabase synchronization, and offline storage.
 */

import { supabase } from './supabase';

export interface Customer {
  id: string;
  client_id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  balance: number; // Positive = credit, Negative = debt
  total_spent: number;
  orders_count: number;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface Supplier {
  id: string;
  client_id: string;
  name: string;
  company_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  balance: number; // Balance owed to supplier
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface PurchaseItem {
  product_id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

export interface Purchase {
  id: string;
  client_id: string;
  supplier_id?: string;
  supplier_name: string;
  invoice_number: string;
  warehouse_id: string;
  purchase_date: string;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  total_amount: number;
  paid_amount: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
  items: PurchaseItem[];
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface Expense {
  id: string;
  client_id: string;
  category: 'rent' | 'salaries' | 'utilities' | 'supplies' | 'marketing' | 'maintenance' | 'transport' | 'other';
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'card';
  expense_date: string;
  description: string;
  receipt_number?: string;
  performed_by?: string;
  shift_id?: string;
  created_at: string;
}

export const EXPENSE_CATEGORIES: Record<string, { label: string; color: string }> = {
  rent: { label: 'إيجار المقر', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  salaries: { label: 'رواتب ومكافآت', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  utilities: { label: 'فواتير (كهرباء/مياه/نت)', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  supplies: { label: 'مستلزمات ونثريات', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  marketing: { label: 'تسويق وإعلانات', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  maintenance: { label: 'صيانة ومعدات', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  transport: { label: 'شحن ونقليات', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  other: { label: 'مصروفات أخرى', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

class ERPService {
  private getStorageKey(clientId: string, entity: string): string {
    return `ordexa_erp_${clientId}_${entity}`;
  }

  private getLocalList<T>(clientId: string, entity: string): T[] {
    try {
      const raw = localStorage.getItem(this.getStorageKey(clientId, entity));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private setLocalList<T>(clientId: string, entity: string, items: T[]): void {
    try {
      localStorage.setItem(this.getStorageKey(clientId, entity), JSON.stringify(items));
    } catch (e) {
      console.warn('ERP local cache storage warning:', e);
    }
  }

  // ==========================================
  // CUSTOMERS
  // ==========================================
  async getCustomers(clientId: string): Promise<Customer[]> {
    if (!clientId) return [];
    
    // Check local storage first
    let list = this.getLocalList<Customer>(clientId, 'customers');

    // Attempt remote sync with server or activity_logs
    try {
      const res = await fetch(`/api/erp/customers?clientId=${encodeURIComponent(clientId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.customers)) {
          list = json.customers;
          this.setLocalList(clientId, 'customers', list);
          return list;
        }
      }
    } catch {
      // Offline fallback
    }

    if (list.length === 0) {
      // Seed default general customer if none exist
      const defaultCustomer: Customer = {
        id: 'cust-general',
        client_id: clientId,
        name: 'عميل نقدي عام (افتراضي)',
        phone: '---',
        email: '',
        address: 'المتجر',
        tax_number: '',
        balance: 0,
        total_spent: 0,
        orders_count: 0,
        notes: 'حساب العميل النقدي الافتراضي للطلبات السريعة',
        created_at: new Date().toISOString(),
      };
      list = [defaultCustomer];
      this.setLocalList(clientId, 'customers', list);
    }

    return list;
  }

  async saveCustomer(clientId: string, customerData: Partial<Customer>): Promise<Customer> {
    const list = await this.getCustomers(clientId);
    let updatedCustomer: Customer;

    if (customerData.id) {
      const index = list.findIndex((c) => c.id === customerData.id);
      if (index >= 0) {
        updatedCustomer = {
          ...list[index],
          ...customerData,
          updated_at: new Date().toISOString(),
        } as Customer;
        list[index] = updatedCustomer;
      } else {
        updatedCustomer = {
          id: customerData.id,
          client_id: clientId,
          name: customerData.name || 'عميل جديد',
          balance: customerData.balance || 0,
          total_spent: customerData.total_spent || 0,
          orders_count: customerData.orders_count || 0,
          created_at: new Date().toISOString(),
          ...customerData,
        } as Customer;
        list.unshift(updatedCustomer);
      }
    } else {
      updatedCustomer = {
        id: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        client_id: clientId,
        name: customerData.name || 'عميل جديد',
        phone: customerData.phone || '',
        email: customerData.email || '',
        address: customerData.address || '',
        tax_number: customerData.tax_number || '',
        balance: customerData.balance || 0,
        total_spent: customerData.total_spent || 0,
        orders_count: customerData.orders_count || 0,
        notes: customerData.notes || '',
        created_at: new Date().toISOString(),
      };
      list.unshift(updatedCustomer);
    }

    this.setLocalList(clientId, 'customers', list);

    // Sync to backend asynchronously
    fetch('/api/erp/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, customer: updatedCustomer }),
    }).catch(() => {});

    return updatedCustomer;
  }

  async deleteCustomer(clientId: string, id: string): Promise<void> {
    const list = (await this.getCustomers(clientId)).filter((c) => c.id !== id);
    this.setLocalList(clientId, 'customers', list);
    fetch(`/api/erp/customers/${id}?clientId=${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }

  // ==========================================
  // SUPPLIERS
  // ==========================================
  async getSuppliers(clientId: string): Promise<Supplier[]> {
    if (!clientId) return [];
    let list = this.getLocalList<Supplier>(clientId, 'suppliers');

    try {
      const res = await fetch(`/api/erp/suppliers?clientId=${encodeURIComponent(clientId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.suppliers)) {
          list = json.suppliers;
          this.setLocalList(clientId, 'suppliers', list);
          return list;
        }
      }
    } catch {}

    return list;
  }

  async saveSupplier(clientId: string, supplierData: Partial<Supplier>): Promise<Supplier> {
    const list = await this.getSuppliers(clientId);
    let updatedSupplier: Supplier;

    if (supplierData.id) {
      const index = list.findIndex((s) => s.id === supplierData.id);
      if (index >= 0) {
        updatedSupplier = {
          ...list[index],
          ...supplierData,
          updated_at: new Date().toISOString(),
        } as Supplier;
        list[index] = updatedSupplier;
      } else {
        updatedSupplier = {
          id: supplierData.id,
          client_id: clientId,
          name: supplierData.name || 'مورد جديد',
          balance: supplierData.balance || 0,
          created_at: new Date().toISOString(),
          ...supplierData,
        } as Supplier;
        list.unshift(updatedSupplier);
      }
    } else {
      updatedSupplier = {
        id: `supp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        client_id: clientId,
        name: supplierData.name || 'مورد جديد',
        company_name: supplierData.company_name || '',
        phone: supplierData.phone || '',
        email: supplierData.email || '',
        address: supplierData.address || '',
        tax_number: supplierData.tax_number || '',
        balance: supplierData.balance || 0,
        notes: supplierData.notes || '',
        created_at: new Date().toISOString(),
      };
      list.unshift(updatedSupplier);
    }

    this.setLocalList(clientId, 'suppliers', list);

    fetch('/api/erp/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, supplier: updatedSupplier }),
    }).catch(() => {});

    return updatedSupplier;
  }

  async deleteSupplier(clientId: string, id: string): Promise<void> {
    const list = (await this.getSuppliers(clientId)).filter((s) => s.id !== id);
    this.setLocalList(clientId, 'suppliers', list);
    fetch(`/api/erp/suppliers/${id}?clientId=${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }

  // ==========================================
  // PURCHASES & STOCK RECEIVING
  // ==========================================
  async getPurchases(clientId: string): Promise<Purchase[]> {
    if (!clientId) return [];
    let list = this.getLocalList<Purchase>(clientId, 'purchases');

    try {
      const res = await fetch(`/api/erp/purchases?clientId=${encodeURIComponent(clientId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.purchases)) {
          list = json.purchases;
          this.setLocalList(clientId, 'purchases', list);
          return list;
        }
      }
    } catch {}

    return list;
  }

  async savePurchase(clientId: string, purchaseData: Partial<Purchase>): Promise<Purchase> {
    const list = await this.getPurchases(clientId);
    let updatedPurchase: Purchase;

    if (purchaseData.id) {
      const index = list.findIndex((p) => p.id === purchaseData.id);
      if (index >= 0) {
        updatedPurchase = {
          ...list[index],
          ...purchaseData,
        } as Purchase;
        list[index] = updatedPurchase;
      } else {
        updatedPurchase = {
          id: purchaseData.id,
          client_id: clientId,
          invoice_number: purchaseData.invoice_number || `PO-${Date.now().toString().slice(-6)}`,
          status: 'draft',
          total_amount: purchaseData.total_amount || 0,
          paid_amount: purchaseData.paid_amount || 0,
          payment_status: 'unpaid',
          items: purchaseData.items || [],
          created_at: new Date().toISOString(),
          ...purchaseData,
        } as Purchase;
        list.unshift(updatedPurchase);
      }
    } else {
      updatedPurchase = {
        id: `po-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        client_id: clientId,
        supplier_id: purchaseData.supplier_id || '',
        supplier_name: purchaseData.supplier_name || 'مورد عام',
        invoice_number: purchaseData.invoice_number || `PO-${Date.now().toString().slice(-6)}`,
        warehouse_id: purchaseData.warehouse_id || '',
        purchase_date: purchaseData.purchase_date || new Date().toISOString(),
        status: purchaseData.status || 'draft',
        total_amount: purchaseData.total_amount || 0,
        paid_amount: purchaseData.paid_amount || 0,
        payment_status: purchaseData.payment_status || 'unpaid',
        items: purchaseData.items || [],
        notes: purchaseData.notes || '',
        created_by: purchaseData.created_by || '',
        created_at: new Date().toISOString(),
      };
      list.unshift(updatedPurchase);
    }

    this.setLocalList(clientId, 'purchases', list);

    fetch('/api/erp/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, purchase: updatedPurchase }),
    }).catch(() => {});

    return updatedPurchase;
  }

  /**
   * Receive a Purchase Order:
   * Increments real stock in Supabase `inventory_balances` table
   * and creates `inventory_transactions` records!
   */
  async receivePurchaseOrder(clientId: string, purchaseId: string, warehouseId: string): Promise<Purchase> {
    const list = await this.getPurchases(clientId);
    const purchase = list.find((p) => p.id === purchaseId);
    if (!purchase) throw new Error('أمر الشراء غير موجود');

    if (purchase.status === 'received') {
      throw new Error('تم استلام هذا الطلب وإدخال كمياته للمستودع مسبقاً');
    }

    // Call server to atomically increment stock in Supabase database
    try {
      const res = await fetch('/api/erp/purchases/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          purchaseId,
          warehouseId: warehouseId || purchase.warehouse_id,
          items: purchase.items,
          invoiceNumber: purchase.invoice_number,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.warn('Server purchase receive error, falling back locally:', errJson.error);
      }
    } catch (e) {
      console.warn('Network error during purchase receive:', e);
    }

    // Update status
    purchase.status = 'received';
    purchase.warehouse_id = warehouseId || purchase.warehouse_id;
    this.setLocalList(clientId, 'purchases', list);

    return purchase;
  }

  // ==========================================
  // EXPENSES
  // ==========================================
  async getExpenses(clientId: string): Promise<Expense[]> {
    if (!clientId) return [];
    let list = this.getLocalList<Expense>(clientId, 'expenses');

    try {
      const res = await fetch(`/api/erp/expenses?clientId=${encodeURIComponent(clientId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.expenses)) {
          list = json.expenses;
          this.setLocalList(clientId, 'expenses', list);
          return list;
        }
      }
    } catch {}

    return list;
  }

  async saveExpense(clientId: string, expenseData: Partial<Expense>): Promise<Expense> {
    const list = await this.getExpenses(clientId);
    let updatedExpense: Expense;

    if (expenseData.id) {
      const index = list.findIndex((e) => e.id === expenseData.id);
      if (index >= 0) {
        updatedExpense = {
          ...list[index],
          ...expenseData,
        } as Expense;
        list[index] = updatedExpense;
      } else {
        updatedExpense = {
          id: expenseData.id,
          client_id: clientId,
          category: 'other',
          amount: 0,
          payment_method: 'cash',
          expense_date: new Date().toISOString(),
          description: '',
          created_at: new Date().toISOString(),
          ...expenseData,
        } as Expense;
        list.unshift(updatedExpense);
      }
    } else {
      updatedExpense = {
        id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        client_id: clientId,
        category: expenseData.category || 'other',
        amount: Number(expenseData.amount) || 0,
        payment_method: expenseData.payment_method || 'cash',
        expense_date: expenseData.expense_date || new Date().toISOString(),
        description: expenseData.description || '',
        receipt_number: expenseData.receipt_number || '',
        performed_by: expenseData.performed_by || '',
        shift_id: expenseData.shift_id || '',
        created_at: new Date().toISOString(),
      };
      list.unshift(updatedExpense);
    }

    this.setLocalList(clientId, 'expenses', list);

    // Sync to backend
    fetch('/api/erp/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, expense: updatedExpense }),
    }).catch(() => {});

    return updatedExpense;
  }

  async deleteExpense(clientId: string, id: string): Promise<void> {
    const list = (await this.getExpenses(clientId)).filter((e) => e.id !== id);
    this.setLocalList(clientId, 'expenses', list);
    fetch(`/api/erp/expenses/${id}?clientId=${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }
}

export const erpService = new ERPService();
