import { useMemo } from 'react';
import { useClientStore } from '../store/clientStore';
import { getCurrencySymbol, formatCurrencyAmount, SUPPORTED_CURRENCIES } from '../lib/currency';

export function useCurrency() {
  const client = useClientStore((state) => state.client);
  const currencyCode = client?.currency || 'EGP';

  const currencySymbol = useMemo(() => {
    return getCurrencySymbol(currencyCode);
  }, [currencyCode]);

  const formatCurrency = useMemo(() => {
    return (amount: number | string) => formatCurrencyAmount(amount, currencyCode);
  }, [currencyCode]);

  return {
    currencyCode,
    currencySymbol,
    formatCurrency,
    formatPrice: formatCurrency,
    supportedCurrencies: Object.values(SUPPORTED_CURRENCIES),
  };
}
