import React, { useState, useEffect } from 'react';
import { Store, DollarSign, AlertCircle, X, Laptop, UserCheck } from 'lucide-react';
import { useShiftStore } from '../../../store/shiftStore';
import { useAuthStore } from '../../../store/authStore';
import { useDeviceStore } from '../../../store/deviceStore';
import { useCurrency } from '../../../hooks/useCurrency';
import { warehouseService } from '../../../lib/warehouseService';
import { shiftService } from '../../../lib/shiftService';
import { Warehouse, CashRegister } from '../../../types';
import toast from 'react-hot-toast';

interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultWarehouseId?: string;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  isOpen,
  onClose,
  defaultWarehouseId,
}) => {
  const { clientUser, user } = useAuthStore();
  const clientId = clientUser?.client_id;
  const { openShift, isLoading } = useShiftStore();
  const { fingerprint, deviceName, isActivated, device } = useDeviceStore();
  const { currencySymbol, currencyName } = useCurrency();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(defaultWarehouseId || '');
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('');
  const [openingCash, setOpeningCash] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [isFetching, setIsFetching] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && clientId) {
      loadInitialData();
    }
  }, [isOpen, clientId]);

  const loadInitialData = async () => {
    if (!clientId) return;
    setIsFetching(true);
    try {
      const whList = await warehouseService.fetchWarehouses(clientId);
      setWarehouses(whList);
      
      const whId = defaultWarehouseId || whList.find(w => w.is_default)?.id || whList[0]?.id || '';
      setSelectedWarehouseId(whId);

      const regList = await shiftService.fetchRegisters(clientId, whId);
      setRegisters(regList);
      if (regList.length > 0) {
        setSelectedRegisterId(regList[0].id);
      }
    } catch (err: any) {
      toast.error('حدث خطأ في تحميل بيانات المستودعات والصناديق');
    } finally {
      setIsFetching(false);
    }
  };

  const handleWarehouseChange = async (whId: string) => {
    setSelectedWarehouseId(whId);
    if (clientId) {
      const regList = await shiftService.fetchRegisters(clientId, whId);
      setRegisters(regList);
      setSelectedRegisterId(regList[0]?.id || '');
    }
  };

  const addCashAmount = (amount: number) => {
    const current = parseFloat(openingCash) || 0;
    setOpeningCash(String(Number((current + amount).toFixed(2))));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      toast.error('تعذر تحديد بيانات المنشأة.');
      return;
    }

    if (!user?.id && !clientUser?.id) {
      toast.error('تعذر تحديد حساب الكاشير. يرجى تسجيل الدخول مرة أخرى.');
      return;
    }

    if (!selectedWarehouseId) {
      toast.error('يرجى تحديد الفرع أو المستودع');
      return;
    }

    const cashValue = openingCash === '' ? 0 : parseFloat(openingCash);
    if (isNaN(cashValue) || cashValue < 0) {
      toast.error('الرصيد الافتتاحي لا يمكن أن يكون سالباً');
      return;
    }

    try {
      await openShift({
        client_id: clientId,
        warehouse_id: selectedWarehouseId,
        register_id: selectedRegisterId || undefined,
        device_id: device?.id || undefined,
        device_fingerprint: fingerprint,
        opening_cash: cashValue,
        opening_notes: notes.trim() || undefined,
        user_id: user?.id,
        opened_by: clientUser?.id,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ordexa:shift-updated'));
      }

      toast.success('تم فتح الوردية بنجاح! جاهز لبدء البيع');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'فشل فتح الوردية');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        id="open-shift-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">بدء وردية جديدة (Open Shift)</h3>
              <p className="text-xs text-slate-500">تسجيل العهدة النقدية الافتتاحية وفتح الصندوق</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Terminal & Cashier Binding Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isActivated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>{device?.device_name || deviceName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      isActivated ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {isActivated ? 'معتمد' : 'غير مسجل'}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    بصمة الجهاز: {fingerprint}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>{clientUser?.name || 'الكاشير'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {clientUser?.role === 'owner' ? 'مالك' : clientUser?.role === 'admin' ? 'مدير' : 'كاشير'}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    معرف الحساب: {clientUser?.id ? `${clientUser.id.substring(0, 8)}...` : 'غير متصل'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Warehouse Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              الفرع / المستودع <span className="text-rose-500">*</span>
            </label>
            <select
              id="shift-warehouse-select"
              value={selectedWarehouseId}
              onChange={(e) => handleWarehouseChange(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              required
              disabled={isFetching || warehouses.length === 0}
            >
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} {wh.is_default ? '(الافتراضي)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Cash Register Selection (if available) */}
          {registers.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                نقطة البيع / الصندوق
              </label>
              <select
                id="shift-register-select"
                value={selectedRegisterId}
                onChange={(e) => setSelectedRegisterId(e.target.value)}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {registers.map((reg) => (
                  <option key={reg.id} value={reg.id}>
                    {reg.name} ({reg.code || 'POS'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Opening Cash Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                الرصيد الافتتاحي في الدرج (العهدة النقدية) <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                {currencyName} ({currencySymbol})
              </span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <DollarSign className="w-5 h-5" />
              </div>
              <input
                id="shift-opening-cash-input"
                type="number"
                step="0.01"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                className="w-full h-12 pr-11 pl-4 text-left font-mono text-lg font-bold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                dir="ltr"
              />
            </div>

            {/* Quick Chips */}
            <div className="flex items-center gap-2 mt-2.5">
              {[50, 100, 200, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => addCashAmount(amt)}
                  className="flex-1 py-1.5 px-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  +{amt} {currencySymbol}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpeningCash('0')}
                className="py-1.5 px-3 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
              >
                تصفير (0)
              </button>
            </div>
          </div>

          {/* Opening Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              ملاحظات افتتاح الوردية (اختياري)
            </label>
            <textarea
              id="shift-opening-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`مثال: استلام العهدة كاملة فئات 100 و 50 ${currencySymbol}...`}
              className="w-full p-3 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/60 text-amber-800 text-xs leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              لا يمكن إتمام أي عملية بيع من نقطة البيع إلا بوجود وردية مفتوحة. سيتم ربط مبيعاتك بهذه الوردية مباشرة لحساب النقدية ومطابقتها.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              disabled={isLoading}
            >
              إلغاء
            </button>
            <button
              id="btn-confirm-open-shift"
              type="submit"
              disabled={isLoading || isFetching}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>جاري الفتح...</span>
                </>
              ) : (
                <span>فتح الوردية وبدء البيع</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
