import React from 'react';
import { LicenseType, LicenseStatus } from '../types';

/**
 * Generates a cryptographically secure, human-readable License Key.
 * Format: ORD-XXXX-XXXX-XXXX-XXXX
 * Uses crypto.getRandomValues with unambiguous uppercase alphanumeric characters.
 */
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing characters (0, O, 1, I)
  const getRandomBlock = (length: number = 4): string => {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array)
      .map((byte) => chars[byte % chars.length])
      .join('');
  };

  return `ORD-${getRandomBlock(4)}-${getRandomBlock(4)}-${getRandomBlock(4)}-${getRandomBlock(4)}`;
}

/**
 * Determines the effective status of a license.
 * If expired based on date and not revoked, it is considered expired.
 */
export function getEffectiveLicenseStatus(status: string, expiryDate: string): LicenseStatus {
  if (status === 'revoked') return 'revoked';
  if (status === 'suspended') return 'suspended';
  
  if (expiryDate && new Date(expiryDate) < new Date()) {
    return 'expired';
  }
  
  return (status as LicenseStatus) || 'active';
}

export function getLicenseTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    trial: 'تجريبي (Trial)',
    monthly: 'شهري (Monthly)',
    quarterly: 'ربع سنوي (Quarterly)',
    semi_annual: 'نصف سنوي (Semi-Annual)',
    annual: 'سنوي (Annual)',
    lifetime: 'مدى الحياة (Lifetime)',
    custom: 'مخصص (Custom)',
  };
  return labels[type] || type;
}

export function getLicenseStatusBadge(status: string, expiryDate?: string) {
  const effective = expiryDate ? getEffectiveLicenseStatus(status, expiryDate) : (status as LicenseStatus);

  switch (effective) {
    case 'active':
      return {
        label: 'نشط',
        className: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
      };
    case 'suspended':
      return {
        label: 'موقوف',
        className: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
      };
    case 'expired':
      return {
        label: 'منتهي الصلاحية',
        className: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20',
      };
    case 'revoked':
      return {
        label: 'ملغي نهائياً',
        className: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20',
      };
    default:
      return {
        label: status,
        className: 'bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-600/20',
      };
  }
}
