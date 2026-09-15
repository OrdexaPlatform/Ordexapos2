/**
 * Image Upload & Validation Utilities for Ordexa POS
 * Enforces strict MIME checks, size limits, and client-side optimization
 */

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  file?: File;
  dataUrl?: string;
  width?: number;
  height?: number;
  fileSizeFormatted?: string;
}

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
];

export const FORBIDDEN_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.msi',
  '.dll',
  '.js',
  '.vbs',
  '.ps1',
  '.py',
  '.php',
  '.scr',
  '.com',
  '.pif',
];

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validates an image file before reading/uploading.
 */
export function validateImageFile(
  file: File,
  maxSizeBytes: number = 5 * 1024 * 1024 // 5MB default
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'لم يتم اختيار أي ملف.' };
  }

  const fileName = (file.name || '').toLowerCase();

  // 1. Check dangerous extensions
  if (FORBIDDEN_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
    return {
      valid: false,
      error: 'نوع الملف المختار غير مسموح به لأسباب أمنية. يرجى اختيار ملف صورة صالح.',
    };
  }

  // 2. Check MIME type
  const mimeType = (file.type || '').toLowerCase();
  const isAllowedMime = ALLOWED_IMAGE_MIME_TYPES.includes(mimeType);
  const hasImageExt = /\.(png|jpe?g|webp|svg|ico)$/i.test(fileName);

  if (!isAllowedMime && !hasImageExt) {
    return {
      valid: false,
      error: 'تنسيق الملف غير مدعوم. الصيغ المسموح بها هي: PNG, JPG, WEBP, SVG, ICO.',
    };
  }

  // 3. Check File Size
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `حجم الصورة يتجاوز الحد الأقصى المسموح (${formatBytes(maxSizeBytes)}). الحجم الحالي: ${formatBytes(file.size)}.`,
    };
  }

  return { valid: true };
}

/**
 * Reads a File object and optimizes it via Canvas (max dimensions, high quality PNG or WEBP)
 * to ensure fast rendering, offline storage, and minimal storage overhead.
 */
export async function processAndOptimizeImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    maxSizeBytes?: number;
    quality?: number;
  } = {}
): Promise<ImageValidationResult> {
  const validation = validateImageFile(file, options.maxSizeBytes);
  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }

  const maxWidth = options.maxWidth || 512;
  const maxHeight = options.maxHeight || 512;
  const quality = options.quality ?? 0.92;

  // For SVG files, preserve vector format directly
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve({
          valid: true,
          dataUrl,
          file,
          fileSizeFormatted: formatBytes(file.size),
        });
      };
      reader.onerror = () => {
        resolve({ valid: false, error: 'حدث خطأ أثناء قراءة ملف SVG.' });
      };
      reader.readAsDataURL(file);
    });
  }

  // For Raster Images (PNG, JPG, WEBP, ICO)
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            valid: true,
            dataUrl: rawDataUrl,
            width: img.width,
            height: img.height,
            fileSizeFormatted: formatBytes(file.size),
          });
          return;
        }

        // High quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Export as PNG for transparency support
        const optimizedDataUrl = canvas.toDataURL('image/png', quality);

        resolve({
          valid: true,
          dataUrl: optimizedDataUrl,
          width,
          height,
          fileSizeFormatted: formatBytes(file.size),
        });
      };

      img.onerror = () => {
        resolve({ valid: false, error: 'تعذر معالجة الصورة، قد يكون الملف تالفاً.' });
      };

      img.src = rawDataUrl;
    };

    reader.onerror = () => {
      resolve({ valid: false, error: 'فشل في قراءة الملف من الجهاز.' });
    };

    reader.readAsDataURL(file);
  });
}
