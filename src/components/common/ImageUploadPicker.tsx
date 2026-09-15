import React, { useRef, useState } from 'react';
import { 
  UploadCloud, 
  Trash2, 
  RefreshCw, 
  Image as ImageIcon, 
  AlertCircle, 
  CheckCircle2, 
  FileCheck,
  Eye
} from 'lucide-react';
import { processAndOptimizeImage } from '../../lib/imageUploadUtils';

interface ImageUploadPickerProps {
  label: string;
  description?: string;
  value?: string | null;
  defaultValueUrl?: string;
  isCustom?: boolean;
  onChange: (dataUrl: string, file: File) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  disabled?: boolean;
  aspectRatio?: 'square' | 'wide';
  maxWidth?: number;
  maxHeight?: number;
  badgeText?: string;
  helperNote?: string;
}

export const ImageUploadPicker: React.FC<ImageUploadPickerProps> = ({
  label,
  description,
  value,
  defaultValueUrl,
  isCustom = false,
  onChange,
  onRemove,
  disabled = false,
  aspectRatio = 'square',
  maxWidth = 512,
  maxHeight = 512,
  badgeText,
  helperNote,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metaInfo, setMetaInfo] = useState<{ dimensions?: string; size?: string; name?: string } | null>(null);

  const displayImage = value || defaultValueUrl || null;

  const handleFile = async (file: File) => {
    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const result = await processAndOptimizeImage(file, {
        maxWidth,
        maxHeight,
        maxSizeBytes: 5 * 1024 * 1024,
      });

      if (!result.valid || !result.dataUrl) {
        setErrorMessage(result.error || 'الملف المختار غير صالح.');
        return;
      }

      setMetaInfo({
        name: file.name,
        size: result.fileSizeFormatted,
        dimensions: result.width && result.height ? `${result.width} × ${result.height} بكسل` : undefined,
      });

      await onChange(result.dataUrl, file);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء معالجة الصورة.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isProcessing) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isProcessing) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleOpenPicker = () => {
    if (disabled || isProcessing) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-3 text-right" dir="rtl">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/x-icon"
        onChange={handleInputChange}
        disabled={disabled || isProcessing}
        className="hidden"
      />

      {/* Label and badges */}
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-bold text-slate-800">
            {label}
          </label>
          {description && (
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
        {badgeText && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            {badgeText}
          </span>
        )}
      </div>

      {/* Error alert if any */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
          <span className="flex-1">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800 text-xs font-bold"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Main Box: Preview & Controls */}
      <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row items-center gap-5">
          {/* Preview Box */}
          <div
            onClick={handleOpenPicker}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative group cursor-pointer overflow-hidden rounded-2xl border-2 transition-all flex items-center justify-center shrink-0 ${
              aspectRatio === 'square' ? 'w-28 h-28' : 'w-44 h-28'
            } ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50 scale-102 ring-4 ring-indigo-100'
                : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{
              backgroundImage:
                'radial-gradient(#e2e8f0 1px, transparent 1px)',
              backgroundSize: '8px 8px',
            }}
            title="انقر لتغيير الصورة أو اسحب وأفلت"
          >
            {displayImage ? (
              <img
                src={displayImage}
                alt={label}
                className="w-full h-full object-contain p-2 transition-transform duration-200 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-2 text-center text-slate-400">
                <ImageIcon className="h-8 w-8 text-slate-300 mb-1" />
                <span className="text-[10px] font-medium text-slate-400">
                  لا يوجد شعار
                </span>
              </div>
            )}

            {/* Hover overlay with pick action */}
            {!disabled && (
              <div className="absolute inset-0 bg-slate-900/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2 text-center backdrop-blur-xs">
                <UploadCloud className="h-6 w-6 text-indigo-300 mb-1" />
                <span className="text-[11px] font-semibold">تغيير الصورة</span>
                <span className="text-[9px] text-slate-300">من جهازك</span>
              </div>
            )}

            {/* Processing Spinner */}
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-900/70 text-white flex flex-col items-center justify-center backdrop-blur-xs">
                <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin mb-1" />
                <span className="text-[10px] font-medium">جاري المعالجة...</span>
              </div>
            )}
          </div>

          {/* Controls & Details */}
          <div className="flex-1 w-full space-y-2.5 text-center sm:text-right">
            <div>
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h4 className="text-xs font-bold text-slate-800">
                  {displayImage ? 'تم تعيين الشعار' : 'لم يتم تحديد شعار'}
                </h4>
                {isCustom ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    شعار مخصص
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    الافتراضي
                  </span>
                )}
              </div>

              {metaInfo && (
                <p className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-2 justify-center sm:justify-start">
                  {metaInfo.name && <span>{metaInfo.name}</span>}
                  {metaInfo.size && <span>• {metaInfo.size}</span>}
                  {metaInfo.dimensions && <span>• {metaInfo.dimensions}</span>}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
              <button
                type="button"
                onClick={handleOpenPicker}
                disabled={disabled || isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>{displayImage ? 'استبدال الصورة من الجهاز' : 'رفع صورة من الجهاز'}</span>
              </button>

              {onRemove && (displayImage || isCustom) && (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={disabled || isProcessing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-medium transition-colors disabled:opacity-50"
                  title="حذف الشعار واستعادة الافتراضي"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>حذف واستعادة الافتراضي</span>
                </button>
              )}
            </div>

            {/* Helper info */}
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {helperNote || 'الصيغ المدعومة: PNG, JPG, WEBP, SVG, ICO (حتى 5MB). يتم التحجيم التلقائي للحفاظ على أداء سريع ووضوح فائق.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
