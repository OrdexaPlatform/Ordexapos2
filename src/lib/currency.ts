/**
 * Centralized Multi-Currency Engine for Ordexa POS
 * Supports dynamic per-client currency configuration (EGP, SAR, AED, USD, etc.)
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  EGP: { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م' },
  SAR: { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' },
  AED: { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ' },
  KWD: { code: 'KWD', name: 'دينار كويتي', symbol: 'د.ك' },
  QAR: { code: 'QAR', name: 'ريال قطري', symbol: 'ر.ق' },
  BHD: { code: 'BHD', name: 'دينار بحريني', symbol: 'د.ب' },
  OMR: { code: 'OMR', name: 'ريال عماني', symbol: 'ر.ع' },
  JOD: { code: 'JOD', name: 'دينار أردني', symbol: 'د.أ' },
  USD: { code: 'USD', name: 'دولار أمريكي', symbol: '$' },
  EUR: { code: 'EUR', name: 'يورو', symbol: '€' },
};

/**
 * Returns the Arabic or standard symbol for a currency code
 * Defaults to 'ج.م' if code is missing or unassigned
 */
export function getCurrencySymbol(code?: string | null): string {
  if (!code) return 'ج.م';
  const upper = code.toUpperCase().trim();
  return SUPPORTED_CURRENCIES[upper]?.symbol || upper;
}

/**
 * Returns formatted currency amount with client's currency symbol
 * e.g., "150.00 ج.م" or "150.00 ر.س"
 */
export function formatCurrencyAmount(amount: number | string, code?: string | null): string {
  const num = Number(amount) || 0;
  const symbol = getCurrencySymbol(code);
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
}
