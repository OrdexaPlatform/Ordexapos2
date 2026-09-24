import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

export interface BarcodeViewProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
  className?: string;
  format?: 'CODE128' | 'EAN13' | 'UPC' | 'EAN8' | 'auto';
}

/**
 * Generates a compliant checksum digit for standard EAN-13 barcodes
 */
export function calculateEan13Checksum(first12Digits: string): string {
  if (first12Digits.length !== 12 || !/^\d+$/.test(first12Digits)) {
    return '0';
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12Digits[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const remainder = sum % 10;
  return remainder === 0 ? '0' : String(10 - remainder);
}

/**
 * Utility to generate a valid retail barcode (EAN-13 or Code-128)
 */
export function generateBarcodeNumber(format: 'EAN13' | 'CODE128' = 'CODE128'): string {
  if (format === 'EAN13') {
    // Generate 12 digits (starting with 622 for Egypt or 628 for KSA, or standard 200 internal)
    const prefix = '622';
    const randomBody = Math.floor(100000000 + Math.random() * 900000000).toString().slice(0, 9);
    const twelveDigits = prefix + randomBody;
    const checksum = calculateEan13Checksum(twelveDigits);
    return twelveDigits + checksum;
  }

  // Code-128 alphanumeric
  const randNum = Math.floor(10000000 + Math.random() * 90000000).toString();
  return randNum;
}

export const BarcodeView: React.FC<BarcodeViewProps> = ({
  value,
  width = 1.8,
  height = 48,
  displayValue = true,
  fontSize = 12,
  margin = 8,
  className = '',
  format = 'auto',
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [renderError, setRenderError] = useState<boolean>(false);

  useEffect(() => {
    if (!svgRef.current || !value || !value.trim()) {
      setRenderError(false);
      return;
    }

    try {
      const cleanValue = value.trim();
      let chosenFormat: string = 'CODE128';

      if (format === 'auto') {
        if (/^\d{13}$/.test(cleanValue)) {
          // Check if valid EAN13 checksum
          const body = cleanValue.slice(0, 12);
          const expectedChecksum = calculateEan13Checksum(body);
          if (cleanValue[12] === expectedChecksum) {
            chosenFormat = 'EAN13';
          } else {
            chosenFormat = 'CODE128';
          }
        } else if (/^\d{8}$/.test(cleanValue)) {
          chosenFormat = 'EAN8';
        } else if (/^\d{12}$/.test(cleanValue)) {
          chosenFormat = 'UPC';
        } else {
          chosenFormat = 'CODE128';
        }
      } else {
        chosenFormat = format;
      }

      JsBarcode(svgRef.current, cleanValue, {
        format: chosenFormat,
        width,
        height,
        displayValue,
        fontSize,
        textMargin: 2,
        margin,
        background: '#ffffff',
        lineColor: '#000000',
        valid: (valid) => {
          if (!valid) {
            // Fallback to Code 128
            try {
              if (svgRef.current) {
                JsBarcode(svgRef.current, cleanValue, {
                  format: 'CODE128',
                  width,
                  height,
                  displayValue,
                  fontSize,
                  margin,
                });
                setRenderError(false);
              }
            } catch {
              setRenderError(true);
            }
          } else {
            setRenderError(false);
          }
        },
      });
      setRenderError(false);
    } catch (err) {
      console.warn('Barcode render warning:', err);
      // Try safe code 128 fallback
      try {
        if (svgRef.current) {
          JsBarcode(svgRef.current, value.trim(), {
            format: 'CODE128',
            width,
            height,
            displayValue,
            fontSize,
            margin,
          });
          setRenderError(false);
        }
      } catch {
        setRenderError(true);
      }
    }
  }, [value, width, height, displayValue, fontSize, margin, format]);

  if (!value || !value.trim()) {
    return (
      <div className={`flex flex-col items-center justify-center p-3 border border-dashed border-slate-200 rounded-lg bg-slate-50 text-slate-400 text-xs ${className}`}>
        <span>لا يوجد كود باركود مسجل</span>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className={`flex flex-col items-center justify-center p-2 border border-amber-200 rounded bg-amber-50 text-amber-800 text-xs font-mono ${className}`}>
        <span className="font-bold text-[10px]">كود غير قياسي:</span>
        <span className="font-black text-sm">{value}</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center justify-center bg-white ${className}`}>
      <svg ref={svgRef} className="max-w-full h-auto" />
    </div>
  );
};
