import React, { useState } from 'react';
import { 
  Store, 
  Lock, 
  ArrowUpDown, 
  FileText, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  CheckCircle2,
  Laptop,
  Key,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { Shift } from '../../../types';
import { OpenShiftModal } from './OpenShiftModal';
import { CloseShiftModal } from './CloseShiftModal';
import { CashMovementModal } from './CashMovementModal';
import { ShiftZReportModal } from './ShiftZReportModal';
import { POSTerminalLicenseModal } from './POSTerminalLicenseModal';
import { useDeviceStore } from '../../../store/deviceStore';
import { useClientStore } from '../../../store/clientStore';
import { useCurrency } from '../../../hooks/useCurrency';

interface POSShiftBarProps {
  activeShift: Shift | null;
  warehouseId?: string;
  clientId?: string;
  onRefresh?: () => void;
}

export const POSShiftBar: React.FC<POSShiftBarProps> = ({
  activeShift,
  warehouseId,
  clientId,
  onRefresh,
}) => {
  const { currencySymbol } = useCurrency();
  const [isOpenModalOpen, setIsOpenModalOpen] = useState<boolean>(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [reportShift, setReportShift] = useState<Shift | null>(null);
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState<boolean>(false);

  const { device, isActivated, fingerprint, status: deviceStatus, licenseValidation } = useDeviceStore();
  const { license: clientLicense } = useClientStore();

  const effectiveLicense = licenseValidation?.license || clientLicense;
  const computedDaysLeft = effectiveLicense?.days_left ?? (
    effectiveLicense?.expiry_date 
      ? Math.ceil((new Date(effectiveLicense.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0
  );
  const isExpired = effectiveLicense 
    ? computedDaysLeft <= 0 || effectiveLicense.status === 'expired' 
    : false;

  return (
    <>
      <div id="pos-shift-status-bar" className="w-full">
        {/* Terminal / License Warning Banner if unactivated or expired */}
        {!isActivated && (
          <div className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="font-semibold text-amber-300">تنبيه نقطة البيع:</span>
              <span className="text-slate-300">
                هذا الجهاز غير مسجل حالياً كنقطة بيع معتمدة. يلزم التسجيل لربط الوردية ومبيعات الكاشير بهذا الجهاز.
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsTerminalModalOpen(true)}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-1.5 mr-auto sm:mr-0 text-xs"
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>تسجيل هذا الجهاز الآن</span>
            </button>
          </div>
        )}

        {isExpired && (
          <div className="bg-rose-600 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-rose-700">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-white shrink-0" />
              <span className="font-bold">تنبيه الترخيص:</span>
              <span>انتهت صلاحية ترخيص المنشأة. يرجى تجديد الاشتراك للاستمرار في إصدار الفواتير.</span>
            </div>

            <button
              type="button"
              onClick={() => setIsTerminalModalOpen(true)}
              className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-700 font-bold rounded-lg transition-colors flex items-center gap-1.5 mr-auto sm:mr-0 text-xs"
            >
              <Key className="w-3.5 h-3.5" />
              <span>تفاصيل الترخيص</span>
            </button>
          </div>
        )}

        {activeShift ? (
          /* Active Shift Bar */
          <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800">الوردية النشطة:</span>
                  <span className="text-xs font-mono font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200">
                    {activeShift.shift_number}
                  </span>
                </div>
              </div>

              {/* Warehouse & Register info */}
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 border-r border-slate-200 pr-3 mr-1">
                <span>{activeShift.warehouse_name || 'الفرع'}</span>
                {activeShift.register_name && <span>• {activeShift.register_name}</span>}
              </div>

              {/* Terminal / License Indicator Chip */}
              <button
                type="button"
                onClick={() => setIsTerminalModalOpen(true)}
                className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  isActivated
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100/70'
                    : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                }`}
                title="إدارة نقطة البيع وترخيص الجهاز"
              >
                <Laptop className="w-3.5 h-3.5" />
                <span className="font-semibold">
                  {device?.device_name || (isActivated ? 'جهاز معتمد' : 'جهاز غير مسجل')}
                </span>
                <span className="text-[10px] font-mono opacity-80">({fingerprint.slice(0, 8)})</span>
              </button>

              {/* Time Opened */}
              <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>بدأت: {new Date(activeShift.opened_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              {/* Opening / Expected Cash Quick View */}
              <div className="hidden lg:flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>المتوقع بالدرج:</span>
                <span className="font-mono text-emerald-700 font-bold">
                  {(activeShift.closing_cash_expected || activeShift.opening_cash).toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsTerminalModalOpen(true)}
                className="md:hidden px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                title="حالة الجهاز والترخيص"
              >
                <Laptop className="w-3.5 h-3.5" />
              </button>

              <button
                id="btn-pos-cash-movement"
                type="button"
                onClick={() => setIsMovementModalOpen(true)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                title="سحب أو إيداع نقدية بالدرج"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                <span>سحب / إيداع</span>
              </button>

              <button
                id="btn-pos-x-report"
                type="button"
                onClick={() => setIsReportModalOpen(true)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                title="عرض تقرير الجلسة اللحظي"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">تقرير X</span>
              </button>

              <button
                id="btn-pos-close-shift"
                type="button"
                onClick={() => setIsCloseModalOpen(true)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-rose-600" />
                <span>إغلاق الوردية</span>
              </button>
            </div>
          </div>
        ) : (
          /* Warning Bar When NO Shift is Open */
          <div className="bg-amber-500 text-slate-900 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm border-b border-amber-600">
            <div className="flex items-center gap-2 text-xs font-bold">
              <AlertCircle className="w-4 h-4 text-slate-900 shrink-0" />
              <span>
                تنبيه: لا توجد وردية كاشير مفتوحة حالياً. تم تعطيل عمليات البيع حتى يتم فتح وردية جديدة واستلام العهدة النقدية.
              </span>
            </div>

            <div className="flex items-center gap-2 mr-auto sm:mr-0">
              <button
                type="button"
                onClick={() => setIsTerminalModalOpen(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-slate-950 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>الجهاز والترخيص</span>
              </button>

              <button
                id="btn-pos-open-shift-banner"
                type="button"
                onClick={() => setIsOpenModalOpen(true)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                <Store className="w-4 h-4 text-emerald-400" />
                <span>فتح وردية جديدة الآن</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <POSTerminalLicenseModal
        isOpen={isTerminalModalOpen}
        onClose={() => {
          setIsTerminalModalOpen(false);
          if (onRefresh) onRefresh();
        }}
        clientId={clientId}
      />

      <OpenShiftModal
        isOpen={isOpenModalOpen}
        onClose={() => {
          setIsOpenModalOpen(false);
          if (onRefresh) onRefresh();
        }}
        defaultWarehouseId={warehouseId}
      />

      {activeShift && (
        <>
          <CloseShiftModal
            isOpen={isCloseModalOpen}
            onClose={() => {
              setIsCloseModalOpen(false);
              if (onRefresh) onRefresh();
            }}
            shift={activeShift}
            onShiftClosed={(res: any) => {
              const closedShiftObj: Shift = {
                ...activeShift,
                status: 'closed',
                closing_cash_actual: res.closing_cash_actual,
                closing_cash_expected: res.closing_cash_expected,
                cash_difference: res.cash_difference,
                closed_at: new Date().toISOString(),
                total_sales_amount: res.total_sales_amount ?? activeShift.total_sales_amount,
                total_cash_sales: res.total_cash_sales ?? activeShift.total_cash_sales,
                total_card_sales: res.total_card_sales ?? activeShift.total_card_sales,
                total_refunds_amount: res.total_refunds_amount ?? activeShift.total_refunds_amount,
                orders_count: res.orders_count ?? activeShift.orders_count,
              };
              setReportShift(closedShiftObj);
              setIsReportModalOpen(true);
              if (onRefresh) onRefresh();
            }}
          />

          <CashMovementModal
            isOpen={isMovementModalOpen}
            onClose={() => {
              setIsMovementModalOpen(false);
              if (onRefresh) onRefresh();
            }}
            shift={activeShift}
          />
        </>
      )}

      {(reportShift || activeShift) && (
        <ShiftZReportModal
          isOpen={isReportModalOpen}
          onClose={() => {
            setIsReportModalOpen(false);
            setReportShift(null);
          }}
          shift={reportShift || activeShift!}
        />
      )}
    </>
  );
};

