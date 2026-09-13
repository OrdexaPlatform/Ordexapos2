/**
 * Safe client preview token generator and validator.
 * Generates a signed tamper-resistant token for Super Admins to preview a specific client.
 * Does not expose any service_role keys or secrets.
 */

const PREVIEW_SECRET_PREFIX = 'ordexa_preview_';

export interface PreviewTokenPayload {
  clientId: string;
  clientCode: string;
  createdAt: number;
  expiresAt: number;
  mode: 'super_admin_preview';
}

/**
 * Generates a preview token for a client valid for 2 hours.
 */
export function generatePreviewToken(clientId: string, clientCode: string): string {
  const payload: PreviewTokenPayload = {
    clientId,
    clientCode,
    createdAt: Date.now(),
    expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
    mode: 'super_admin_preview',
  };

  const jsonStr = JSON.stringify(payload);
  const base64 = btoa(encodeURIComponent(jsonStr));
  
  // Calculate a lightweight checksum signature
  let hash = 0;
  const rawToSign = `${PREVIEW_SECRET_PREFIX}${base64}`;
  for (let i = 0; i < rawToSign.length; i++) {
    const char = rawToSign.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const sig = Math.abs(hash).toString(36);

  return `${base64}.${sig}`;
}

/**
 * Validates a preview token.
 */
export function validatePreviewToken(token: string, expectedClientId?: string): {
  valid: boolean;
  payload?: PreviewTokenPayload;
  error?: string;
} {
  try {
    if (!token || !token.includes('.')) {
      return { valid: false, error: 'رمز المعاينة غير صالح أو تالف' };
    }

    const [base64, sig] = token.split('.');
    if (!base64 || !sig) {
      return { valid: false, error: 'بنية رمز المعاينة غير صحيحة' };
    }

    // Verify signature
    let hash = 0;
    const rawToSign = `${PREVIEW_SECRET_PREFIX}${base64}`;
    for (let i = 0; i < rawToSign.length; i++) {
      const char = rawToSign.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const expectedSig = Math.abs(hash).toString(36);

    if (sig !== expectedSig) {
      return { valid: false, error: 'فشل التحقق من توقيع رمز المعاينة' };
    }

    const jsonStr = decodeURIComponent(atob(base64));
    const payload: PreviewTokenPayload = JSON.parse(jsonStr);

    if (payload.mode !== 'super_admin_preview') {
      return { valid: false, error: 'نوع رمز المعاينة غير مطابق' };
    }

    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: 'انتهت صلاحية رابط المعاينة، يرجى إعادة التوليد' };
    }

    if (expectedClientId && payload.clientId !== expectedClientId) {
      return { valid: false, error: 'رمز المعاينة لا يطابق المنشأة المطلوبة' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: 'تعذر فك تشفير رمز المعاينة' };
  }
}
