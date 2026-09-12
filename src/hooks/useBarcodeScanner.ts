import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  minBarcodeLength?: number;
  maxKeyIntervalMs?: number;
  enabled?: boolean;
}

/**
 * Custom hook that listens for rapid keyboard input characteristic of hardware USB/HID barcode scanners.
 * Buffers characters and triggers onScan when Enter is pressed within the rapid threshold.
 * Ignores input when typing in regular input/textarea fields (unless key interval is faster than human typing).
 */
export const useBarcodeScanner = ({
  onScan,
  minBarcodeLength = 3,
  maxKeyIntervalMs = 50,
  enabled = true
}: UseBarcodeScannerOptions) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isScanningRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputField = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // When Enter is pressed
      if (event.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        bufferRef.current = '';

        if (barcode.length >= minBarcodeLength && isScanningRef.current) {
          // If the target is an input, prevent default submit/enter behavior
          event.preventDefault();
          event.stopPropagation();
          onScan(barcode);
        }
        isScanningRef.current = false;
        return;
      }

      // Printable single characters only
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        // If typing speed is faster than maxKeyIntervalMs, it's a barcode scanner
        if (interval <= maxKeyIntervalMs) {
          isScanningRef.current = true;
          bufferRef.current += event.key;
        } else {
          // If user is focused on an input field and typing at human speed, reset buffer and let them type normally
          if (isInputField) {
            bufferRef.current = '';
            isScanningRef.current = false;
            return;
          }
          // Reset buffer and start new potential scan
          bufferRef.current = event.key;
          isScanningRef.current = false;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onScan, minBarcodeLength, maxKeyIntervalMs, enabled]);
};
