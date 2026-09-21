import { create } from 'zustand';
import { Product, CartItem } from '../types';

interface POSCartState {
  items: CartItem[];
  selectedWarehouseId: string | null;
  customerName: string;
  notes: string;
  invoiceDiscount: number;
  invoiceDiscountType: 'fixed' | 'percentage';
  taxEnabled: boolean;
  globalTaxRate: number | null;

  // Actions
  setTaxConfig: (enabled: boolean, defaultRate?: number | null) => void;
  setWarehouseId: (warehouseId: string) => void;
  setCustomerName: (name: string) => void;
  setNotes: (notes: string) => void;
  setInvoiceDiscount: (amount: number, type?: 'fixed' | 'percentage') => void;
  
  addItem: (product: Product, quantity?: number) => { success: boolean; message?: string };
  updateItemQuantity: (productId: string, quantity: number) => { success: boolean; message?: string };
  updateItemPrice: (productId: string, unitPrice: number) => void;
  updateItemDiscount: (productId: string, discount: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;

  // Calculators
  getSubtotal: () => number;
  getLineDiscountsTotal: () => number;
  getInvoiceDiscountAmount: () => number;
  getTotalDiscounts: () => number;
  getTotalTax: () => number;
  getGrandTotal: () => number;
  getItemsCount: () => number;
}

function calculateItemLine(
  quantity: number,
  unitPrice: number,
  discountAmount: number,
  taxRate: number
): { taxableAmount: number; taxAmount: number; lineTotal: number } {
  const lineSubtotal = quantity * unitPrice;
  const clampedDiscount = Math.min(Math.max(0, discountAmount), lineSubtotal);
  const taxableAmount = lineSubtotal - clampedDiscount;
  const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 10000) / 10000;
  const lineTotal = taxableAmount + taxAmount;
  return { taxableAmount, taxAmount, lineTotal };
}

export const usePOSCartStore = create<POSCartState>((set, get) => ({
  items: [],
  selectedWarehouseId: null,
  customerName: 'عميل نقدي عام',
  notes: '',
  invoiceDiscount: 0,
  invoiceDiscountType: 'fixed',
  taxEnabled: true,
  globalTaxRate: null,

  setTaxConfig: (enabled: boolean, defaultRate = null) => {
    const state = get();
    const updatedItems = state.items.map(item => {
      const rate = enabled 
        ? (item.product.tax_rate != null && item.product.tax_rate > 0 
            ? Number(item.product.tax_rate) 
            : (defaultRate != null ? Number(defaultRate) : 0))
        : 0;
      const { taxAmount, lineTotal } = calculateItemLine(
        item.quantity,
        item.unit_price,
        item.discount_amount,
        rate
      );
      return {
        ...item,
        tax_rate: rate,
        tax_amount: taxAmount,
        line_total: lineTotal
      };
    });

    set({
      taxEnabled: enabled,
      globalTaxRate: defaultRate,
      items: updatedItems
    });
  },

  setWarehouseId: (warehouseId: string) => set({ selectedWarehouseId: warehouseId }),
  setCustomerName: (name: string) => set({ customerName: name }),
  setNotes: (notes: string) => set({ notes }),
  setInvoiceDiscount: (amount: number, type = 'fixed') => {
    set({
      invoiceDiscount: Math.max(0, amount),
      invoiceDiscountType: type
    });
  },

  addItem: (product: Product, quantity = 1) => {
    const state = get();
    const existingIndex = state.items.findIndex(i => i.product.id === product.id);
    const unitPrice = Number(product.selling_price || 0);
    const taxRate = state.taxEnabled 
      ? (product.tax_rate != null && product.tax_rate > 0 
          ? Number(product.tax_rate) 
          : (state.globalTaxRate != null ? Number(state.globalTaxRate) : 0))
      : 0;

    if (existingIndex > -1) {
      const existing = state.items[existingIndex];
      const newQty = existing.quantity + quantity;

      // Stock validation
      if (product.track_stock && newQty > Number(product.current_stock || 0)) {
        return {
          success: false,
          message: `المخزون المتاح للصنف (${product.name}) هو ${product.current_stock} فقط`
        };
      }

      const { taxAmount, lineTotal } = calculateItemLine(
        newQty,
        existing.unit_price,
        existing.discount_amount,
        existing.tax_rate
      );

      const updatedItems = [...state.items];
      updatedItems[existingIndex] = {
        ...existing,
        quantity: newQty,
        tax_amount: taxAmount,
        line_total: lineTotal
      };

      set({ items: updatedItems });
      return { success: true };
    } else {
      // Stock validation
      if (product.track_stock && quantity > Number(product.current_stock || 0)) {
        return {
          success: false,
          message: `المخزون المتاح للصنف (${product.name}) هو ${product.current_stock} فقط`
        };
      }

      const { taxAmount, lineTotal } = calculateItemLine(
        quantity,
        unitPrice,
        0,
        taxRate
      );

      const newItem: CartItem = {
        product,
        quantity,
        unit_price: unitPrice,
        discount_amount: 0,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        line_total: lineTotal
      };

      set({ items: [newItem, ...state.items] });
      return { success: true };
    }
  },

  updateItemQuantity: (productId: string, quantity: number) => {
    const state = get();
    if (quantity <= 0) {
      // Remove item if quantity is zero or less
      get().removeItem(productId);
      return { success: true };
    }

    const index = state.items.findIndex(i => i.product.id === productId);
    if (index === -1) return { success: false, message: 'الصنف غير موجود في السلة' };

    const item = state.items[index];
    if (item.product.track_stock && quantity > Number(item.product.current_stock || 0)) {
      return {
        success: false,
        message: `المخزون المتاح للصنف (${item.product.name}) هو ${item.product.current_stock} فقط`
      };
    }

    const { taxAmount, lineTotal } = calculateItemLine(
      quantity,
      item.unit_price,
      item.discount_amount,
      item.tax_rate
    );

    const updatedItems = [...state.items];
    updatedItems[index] = {
      ...item,
      quantity,
      tax_amount: taxAmount,
      line_total: lineTotal
    };

    set({ items: updatedItems });
    return { success: true };
  },

  updateItemPrice: (productId: string, unitPrice: number) => {
    const state = get();
    const index = state.items.findIndex(i => i.product.id === productId);
    if (index === -1) return;

    const item = state.items[index];
    const safePrice = Math.max(0, unitPrice);
    const { taxAmount, lineTotal } = calculateItemLine(
      item.quantity,
      safePrice,
      item.discount_amount,
      item.tax_rate
    );

    const updatedItems = [...state.items];
    updatedItems[index] = {
      ...item,
      unit_price: safePrice,
      tax_amount: taxAmount,
      line_total: lineTotal
    };

    set({ items: updatedItems });
  },

  updateItemDiscount: (productId: string, discount: number) => {
    const state = get();
    const index = state.items.findIndex(i => i.product.id === productId);
    if (index === -1) return;

    const item = state.items[index];
    const safeDiscount = Math.max(0, discount);
    const { taxAmount, lineTotal } = calculateItemLine(
      item.quantity,
      item.unit_price,
      safeDiscount,
      item.tax_rate
    );

    const updatedItems = [...state.items];
    updatedItems[index] = {
      ...item,
      discount_amount: safeDiscount,
      tax_amount: taxAmount,
      line_total: lineTotal
    };

    set({ items: updatedItems });
  },

  removeItem: (productId: string) => {
    set(state => ({
      items: state.items.filter(i => i.product.id !== productId)
    }));
  },

  clearCart: () => {
    set({
      items: [],
      notes: '',
      invoiceDiscount: 0,
      customerName: 'عميل نقدي عام'
    });
  },

  getSubtotal: () => {
    return get().items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  },

  getLineDiscountsTotal: () => {
    return get().items.reduce((sum, item) => sum + item.discount_amount, 0);
  },

  getInvoiceDiscountAmount: () => {
    const state = get();
    const subtotalAfterLineDiscounts = Math.max(0, state.getSubtotal() - state.getLineDiscountsTotal());
    if (state.invoiceDiscountType === 'percentage') {
      return (subtotalAfterLineDiscounts * Math.min(100, state.invoiceDiscount)) / 100;
    }
    return Math.min(subtotalAfterLineDiscounts, state.invoiceDiscount);
  },

  getTotalDiscounts: () => {
    return get().getLineDiscountsTotal() + get().getInvoiceDiscountAmount();
  },

  getTotalTax: () => {
    const state = get();
    if (!state.taxEnabled) return 0;
    return state.items.reduce((sum, item) => sum + item.tax_amount, 0);
  },

  getGrandTotal: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const lineDiscounts = state.getLineDiscountsTotal();
    const invoiceDiscount = state.getInvoiceDiscountAmount();
    const tax = state.getTotalTax();
    return Math.max(0, subtotal - lineDiscounts - invoiceDiscount + tax);
  },

  getItemsCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  }
}));
