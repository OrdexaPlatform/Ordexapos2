import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLogger';
import { Modal } from '../../components/ui/Modal';
import { License } from '../../types';
import { Loader2, Calendar } from 'lucide-react';
import { format, addMonths, addYears } from 'date-fns';
import toast from 'react-hot-toast';

interface RenewLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  license: License | null;
}

export function RenewLicenseModal({
  isOpen,
  onClose,
  onSuccess,
  license,
}: RenewLicenseModalProps) {
  if (!license) return null;

  const currentExpiry = new Date(license.expiry_date);
  const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();

  const [newExpiryDate, setNewExpiryDate] = useState<string>(
    format(addYears(baseDate, 1), 'yyyy-MM-dd')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setPreset = (months: number) => {
    if (months === 12) {
      setNewExpiryDate(format(addYears(baseDate, 1), 'yyyy-MM-dd'));
    } else {
      setNewExpiryDate(format(addMonths(baseDate, months), 'yyyy-MM-dd'));
    }
  };

  const handleRenew = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newExpiryDate) {
      toast.error('يرجى تحديد تاريخ الانتهاء الجديد');
      return;
    }

    if (new Date(newExpiryDate) <= new Date(license.start_date)) {
      toast.error('تاريخ الانتهاء يجب أن يكون بعد تاريخ بداية الترخيص');
      return;
    }

    setIsSubmitting(true);
    try {
      // If license was expired, activate it upon renewal
      const nextStatus = license.status === 'revoked' ? 'revoked' : 'active';

      const { error } = await supabase
        .from('licenses')
        .update({
          expiry_date: new Date(newExpiryDate).toISOString(),
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', license.id);

      if (error) throw error;

      await logActivity({
        action: 'renew_license',
        entityType: 'license',
        entityId: license.id,
        metadata: {
          license_key: license.license_key,
          previous_expiry_date: license.expiry_date,
          new_expiry_date: newExpiryDate,
          new_status: nextStatus,
        },
      });

      toast.success('تم تجديد الترخيص بنجاح');
      onSuccess();
    } catch (err: any) {
      console.error('Error renewing license:', err);
      toast.error(err.message || 'حدث خطأ أثناء تجديد الترخيص');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="تجديد صلاحية الترخيص" maxWidth="md">
      <form onSubmit={handleRenew} className="space-y-5 text-right">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            مفتاح الترخيص
          </label>
          <div className="font-mono text-sm bg-slate-100 p-2.5 rounded-md text-slate-900 border border-slate-200" dir="ltr">
            {license.license_key}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            تاريخ الانتهاء الحالي
          </label>
          <div className="text-sm text-slate-700 bg-slate-50 p-2.5 rounded-md border border-slate-200 flex items-center justify-between">
            <span>{format(new Date(license.expiry_date), 'yyyy-MM-dd')}</span>
            <span className="text-xs text-slate-500">
              {new Date(license.expiry_date) < new Date() ? '(منتهي)' : '(ساري)'}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-2">
            خيارات التمديد السريع
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setPreset(1)}
              className="px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors text-center"
            >
              + شهر
            </button>
            <button
              type="button"
              onClick={() => setPreset(3)}
              className="px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors text-center"
            >
              + 3 أشهر
            </button>
            <button
              type="button"
              onClick={() => setPreset(6)}
              className="px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors text-center"
            >
              + 6 أشهر
            </button>
            <button
              type="button"
              onClick={() => setPreset(12)}
              className="px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors text-center"
            >
              + سنة
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            تاريخ الانتهاء الجديد <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="date"
              value={newExpiryDate}
              onChange={(e) => setNewExpiryDate(e.target.value)}
              className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-300 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 shadow-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                <span>جاري التجديد...</span>
              </>
            ) : (
              <span>تأكيد التجديد</span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
