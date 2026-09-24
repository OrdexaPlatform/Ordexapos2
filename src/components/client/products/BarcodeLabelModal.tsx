import React, { useState } from 'react';
import { X, Printer, Barcode as BarcodeIcon, Tag, Check, Sliders, Copy } from 'lucide-react';
import { Product } from '../../../types';
import { useClientStore } from '../../../store/clientStore';
import { useCurrency } from '../../../hooks/useCurrency';
import { BarcodeView } from '../../common/BarcodeView';

export interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

type LabelSize = '50x25' | '50x30' | '40x25' | 'a4-sheet';

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const { client } = useClientStore();
  const { currencySymbol } = useCurrency();

  const [labelSize, setLabelSize] = useState<LabelSize>('50x25');
  const [copies, setCopies] = useState<number>(1);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showStoreName, setShowStoreName] = useState<boolean>(true);
  const [showSku, setShowSku] = useState<boolean>(true);
  const [customPrice, setCustomPrice] = useState<string>('');

  if (!isOpen || !product) return null;

  const effectiveBarcode = (product.barcode && product.barcode.trim()) || product.sku || product.id.slice(0, 8);
  const effectivePrice = customPrice !== '' ? Number(customPrice) : Number(product.selling_price || 0);
  const storeName = client?.business_name || 'Ordexa POS';

  const handlePrint = () => {
    window.print();
  };

  // Dimensions based on label size
  const getDimensions = () => {
    switch (labelSize) {
      case '50x25':
        return { widthMm: 50, heightMm: 25, barcodeWidth: 1.5, barcodeHeight: 32, fontSize: 10 };
      case '50x30':
        return { widthMm: 50, heightMm: 30, barcodeWidth: 1.6, barcodeHeight: 40, fontSize: 11 };
      case '40x25':
        return { widthMm: 40, heightMm: 25, barcodeWidth: 1.3, barcodeHeight: 28, fontSize: 9 };
      case 'a4-sheet':
        return { widthMm: 70, heightMm: 35, barcodeWidth: 1.6, barcodeHeight: 38, fontSize: 11 };
      default:
        return { widthMm: 50, heightMm: 25, barcodeWidth: 1.5, barcodeHeight: 32, fontSize: 10 };
    }
  };

  const dim = getDimensions();
  const copiesArray = Array.from({ length: Math.max(1, Math.min(copies, 200)) }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* Dynamic Print Styles for Thermal & Sheet Printers */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #barcode-print-zone, #barcode-print-zone * {
            visibility: visible;
          }
          #barcode-print-zone {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: white;
          }
          ${
            labelSize === 'a4-sheet'
              ? `
              @page {
                size: A4 portrait;
                margin: 8mm;
              }
              .barcode-label-item {
                break-inside: avoid;
                page-break-inside: avoid;
              }
            `
              : `
              @page {
                size: ${dim.widthMm}mm ${dim.heightMm}mm;
                margin: 0;
              }
              .barcode-label-item {
                width: ${dim.widthMm}mm !important;
                height: ${dim.heightMm}mm !important;
                max-width: ${dim.widthMm}mm !important;
                max-height: ${dim.heightMm}mm !important;
                page-break-after: always;
                break-after: page;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
              }
            `
          }
        }
      `}</style>

      <div 
        id="barcode-label-modal-container"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold shadow-sm">
              <BarcodeIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">طباعة ملصق الباركود (Barcode Label)</h3>
              <p className="text-xs text-slate-500 font-medium">
                {product.name} {product.sku ? `• SKU: ${product.sku}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-print-barcode-labels"
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الملصق ({copies})</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 bg-slate-50/50 print:hidden">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-200">
            {/* Label Size Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span>مقاس الملصق</span>
              </label>
              <select
                value={labelSize}
                onChange={(e) => setLabelSize(e.target.value as LabelSize)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="50x25">50 × 25 مم (قياسي حراري - الأكثر استخداماً)</option>
                <option value="50x30">50 × 30 مم (سوبرماركت وهايبر)</option>
                <option value="40x25">40 × 25 مم (صغير / إكسسوارات)</option>
                <option value="a4-sheet">ورق A4 كامل (24 ملصق بالورقة)</option>
              </select>
            </div>

            {/* Copies Count */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>عدد النسخ للطباعة</span>
              </label>
              <div className="flex items-center gap-1">
                {[1, 5, 10, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCopies(num)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      copies === num
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {num}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1.5 text-center bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  title="أدخل عدداً يدوياً"
                />
              </div>
            </div>

            {/* Price Edit Override */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>السعر على الملصق ({currencySymbol})</span>
              </label>
              <input
                type="number"
                step="0.01"
                placeholder={product.selling_price.toString()}
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Display Toggles */}
          <div className="flex flex-wrap items-center gap-4 bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-700">بيانات الملصق:</span>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showStoreName}
                onChange={(e) => setShowStoreName(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-700">اسم المتجر ({storeName})</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPrice}
                onChange={(e) => setShowPrice(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-700">سعر البيع</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSku}
                onChange={(e) => setShowSku(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-700">رمز الصنف (SKU)</span>
            </label>
          </div>

          {/* Visual Sticker Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>معاينة حية للملصق (مطابق لما يطبع على طابعات الباركود الحرارية):</span>
              <span className="text-slate-400 font-mono font-normal">
                {dim.widthMm} × {dim.heightMm} mm
              </span>
            </div>

            <div className="p-8 bg-slate-200/70 rounded-2xl flex items-center justify-center border border-dashed border-slate-300">
              {/* The Single Sticker Preview Card */}
              <div 
                className="bg-white border-2 border-slate-900 rounded-lg p-2.5 shadow-lg flex flex-col items-center justify-between text-center select-none"
                style={{
                  width: `${dim.widthMm * 4.2}px`,
                  minHeight: `${dim.heightMm * 4.2}px`,
                }}
              >
                {/* Store Name */}
                {showStoreName && (
                  <div className="w-full text-[10px] font-black tracking-wider text-slate-800 border-b border-slate-200 pb-0.5 truncate">
                    {storeName}
                  </div>
                )}

                {/* Product Name */}
                <div className="w-full font-bold text-slate-950 text-xs py-1 line-clamp-2 leading-tight">
                  {product.name}
                </div>

                {/* Barcode Graphic Stripes */}
                <div className="my-0.5 w-full flex justify-center overflow-hidden">
                  <BarcodeView
                    value={effectiveBarcode}
                    width={dim.barcodeWidth}
                    height={dim.barcodeHeight}
                    displayValue={true}
                    fontSize={dim.fontSize}
                    margin={2}
                  />
                </div>

                {/* Bottom Row: SKU & Price */}
                <div className="w-full flex items-center justify-between border-t border-slate-200 pt-1 mt-1 text-[11px]">
                  {showSku && (
                    <span className="font-mono text-[9px] text-slate-500 font-bold truncate max-w-[45%]">
                      {product.sku || 'SKU'}
                    </span>
                  )}
                  {showPrice && (
                    <span className="font-black text-slate-950 text-sm font-mono mr-auto">
                      {effectivePrice.toFixed(2)} <span className="text-[10px] font-sans font-bold">{currencySymbol}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PRINT TARGET ZONE (Visible ONLY during window.print()) */}
        <div id="barcode-print-zone" className="hidden print:block">
          <div className={
            labelSize === 'a4-sheet' 
              ? 'grid grid-cols-3 gap-2 p-2' 
              : 'flex flex-col items-center'
          }>
            {copiesArray.map((idx) => (
              <div
                key={idx}
                className="barcode-label-item bg-white flex flex-col items-center justify-between text-center p-2 box-border border border-black"
                style={{
                  width: `${dim.widthMm}mm`,
                  height: `${dim.heightMm}mm`,
                  pageBreakInside: 'avoid',
                }}
              >
                {showStoreName && (
                  <div className="w-full text-[9px] font-black text-black border-b border-black/40 pb-0.5 truncate leading-none">
                    {storeName}
                  </div>
                )}
                <div className="w-full font-bold text-black text-[11px] leading-tight truncate py-0.5">
                  {product.name}
                </div>
                <div className="w-full flex justify-center items-center overflow-hidden">
                  <BarcodeView
                    value={effectiveBarcode}
                    width={dim.barcodeWidth}
                    height={dim.barcodeHeight}
                    displayValue={true}
                    fontSize={dim.fontSize}
                    margin={1}
                  />
                </div>
                <div className="w-full flex items-center justify-between border-t border-black/40 pt-0.5 leading-none">
                  {showSku && (
                    <span className="font-mono text-[8px] text-black font-semibold truncate">
                      {product.sku || ''}
                    </span>
                  )}
                  {showPrice && (
                    <span className="font-black text-black text-xs font-mono mr-auto">
                      {effectivePrice.toFixed(2)} {currencySymbol}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between print:hidden">
          <div className="text-xs text-slate-500">
            كود الباركود الفعلي: <span className="font-mono font-bold text-slate-800">{effectiveBarcode}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>بدء الطباعة الآن</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
