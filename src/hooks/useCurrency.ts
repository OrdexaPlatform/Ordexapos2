import { useMemo } from 'react';
import { useClientStore } from '../store/clientStore';
import { getCurrencySymbol, formatCurrencyAmount, SUPPORTED_CURRENCIES } from '../lib/currency';

export function useCurrency() {
  const client = useClientStore((state) => state.client);
  
  const currencyCode = useMemo(() => {
    if (client?.currency) return client.currency.toUpperCase();
    try {
      const cached = localStorage.getItem('ordexa_client_currency');
      if (cached) return cached.toUpperCase();
    } catch {}
    return 'EGP';
  }, [client?.currency]);

  const currencySymbol = useMemo(() => {
    return getCurrencySymbol(currencyCode);
  }, [currencyCode]);

  const currencyName = useMemo(() => {
    return SUPPORTED_CURRENCIES[currencyCode]?.name || 'جنيه مصري';
  }, [currencyCode]);

  const formatCurrency = useMemo(() => {
    return (amount: number | string) => formatCurrencyAmount(amount, currencyCode);
  }, [currencyCode]);

  return {
    currencyCode,
    currencySymbol,
    currencyName,
    formatCurrency,
    formatPrice: formatCurrency,
    supportedCurrencies: Object.values(SUPPORTED_CURRENCIES),
  };
}

