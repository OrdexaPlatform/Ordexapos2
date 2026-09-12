import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLogger';
import { Modal } from '../../components/ui/Modal';
import { generateLicenseKey, getLicenseTypeLabel } from '../../lib/licenseUtils';
import { Client, LicenseType } from '../../types';
import { RefreshCw, Loader2, Key } from 'lucide-react';
import { format, addDays, addMonths, addYears } from 'date-fns';
import toast from 'react-hot-toast';

interface LicenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultClientId?: string;
}

export function LicenseFormModal({
  isOpen,
  onClose,
  onSuccess,
  defaultClientId,
}: LicenseFormModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [clientId, setClientId] = useState<string>(defaultClientId || '');
  const [licenseType, setLicenseType] = useState<LicenseType>('annual');
  const [maxDevices, setMaxDevices] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [expiryDate, setExpiryDate] = useState<string>(format(addYears(new Date(), 1), 'yyyy-MM-dd'));
  const [licenseKey, setLicenseKey] = useState<string>('');

  // Fetch clients for dropdown
  useEffect(() => {
    if (isOpen) {
      fetchClients();
      setLicenseKey(generateLicenseKey());
      if (defaultClientId) {
        setClientId(defaultClientId);
      }
    }
  }, [isOpen, defaultClientId]);

  // Adjust expiry date based on license type
  const handleTypeChange = (type: LicenseType) => {
    setLicenseType(type);
    const start = startDate ? new Date(startDate) : new Date();

    switch (type) {
      case 'trial':
        setExpiryDate(format(addDays(start, 14), 'yyyy-MM-dd'));
        break;
      case 'monthly':
        setExpiryDate(format(addMonths(start, 1), 'yyyy-MM-dd'));
        break;
      case 'quarterly':
        setExpiryDate(format(addMonths(start, 3), 'yyyy-MM-dd'));
        break;
      case 'semi_annual':
        setExpiryDate(format(addMonths(start, 6), 'yyyy-MM-dd'));
        break;
      case 'annual':
        setExpiryDate(format(addYears(start, 1), 'yyyy-MM-dd'));
        break;
      case 'lifetime':
        setExpiryDate(format(addYears(start, 50), 'yyyy-MM-dd'));
        break;
      case 'custom':
        // Keep current expiry date
        break;
    }
  };

  const fetchClients = async () => {
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, client_code, customer_name, business_name, status')
        .order('customer_name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
      if (!clientId && data && data.length > 0 && !defaultClientId) {
        setClientId(data[0].id);
      }
    } catch (err) {
      console.error('Error loading clients for license creation:', err);
      toast.error('فشل في تحميل قائمة العملاء');
    } finally {
      setLoadingClients(false);
    }
  };

  const handleRegenerateKey = () => {
    setLicenseKey(generateLicenseKey());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientId) {
      toast.error('يرجى اختيار العميل');
      return;
    }

    if (!maxDevices || maxDevices < 1) {
      toast.error('الحد الأقصى للأجهزة يجب أن يكون جهازاً واحداً على الأقل');
      return;
    }

    if (!startDate || !expiryDate) {
      toast.error('يرجى تحديد تاريخ البداية والنهاية');
      return;
    }

    if (new Date(expiryDate) <= new Date(startDate)) {
      toast.error('تاريخ انتهاء الصلاحية يجب أن يكون بعد تاريخ البداية');
      return;
    }

    if (!licenseKey) {
      toast.error('مفتاح الترخيص غير متوفر');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Check duplicate key
      const { data: existingKey, error: checkError } = await supabase
        .from('licenses')
        .select('id')
        .eq('license_key', licenseKey)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingKey) {
        toast.error('مفتاح الترخيص موجود بالفعل، تم توليد مفتاح جديد، يرجى المحاولة ثانية');
        setLicenseKey(generateLicenseKey());
        setIsSubmitting(false);
        return;
      }

      // 2. Insert license
      const { data: newLicense, error: insertError } = await supabase
        .from('licenses')
        .insert({
          client_id: clientId,
          license_key: licenseKey,
          license_type: licenseType,
          max_devices: Number(maxDevices),
          activated_devices: 0,
          start_date: new Date(startDate).toISOString(),
          expiry_date: new Date(expiryDate).toISOString(),
          status: 'active',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 3. Log activity
      await logActivity({
        action: 'create_license',
        entityType: 'license',
        entityId: newLicense.id,
        metadata: {
          license_key: licenseKey,
          client_id: clientId,
          license_type: licenseType,
          max_devices: maxDevices,
          start_date: startDate,
          expiry_date: expiryDate,
        },
      });

      toast.success('تم إصدار الترخيص بنجاح');
      onSuccess();
    } catch (err: any) {
      console.error('Error creating license:', err);
      toast.error(err.message || 'حدث خطأ أثناء إصدار الترخيص');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="إصدار ترخيص جديد" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-5 text-right">
        {/* Client Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            العميل <span className="text-red-500">*</span>
          </label>
          {loadingClients ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>جاري تحميل العملاء...</span>
            </div>
          ) : (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={!!defaultClientId}
              className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="">-- اختر العميل --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_name} ({c.business_name}) - كود: {c.client_code}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* License Key Generator */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-900">
              مفتاح الترخيص (License Key) <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleRegenerateKey}
              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              <span>توليد جديد</span>
            </button>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <Key className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              readOnly
              value={licenseKey}
              className="block w-full rounded-md border-0 py-2.5 pr-9 pl-3 text-slate-900 font-mono text-sm tracking-wider bg-slate-50 ring-1 ring-inset ring-slate-300 cursor-default select-all"
              dir="ltr"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            مفتاح عشوائي مشفر ومحمي من التكرار.
          </p>
        </div>

        {/* License Type & Max Devices */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              نوع الترخيص <span className="text-red-500">*</span>
            </label>
            <select
              value={licenseType}
              onChange={(e) => handleTypeChange(e.target.value as LicenseType)}
              className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
            >
              <option value="trial">{getLicenseTypeLabel('trial')}</option>
              <option value="monthly">{getLicenseTypeLabel('monthly')}</option>
              <option value="quarterly">{getLicenseTypeLabel('quarterly')}</option>
              <option value="semi_annual">{getLicenseTypeLabel('semi_annual')}</option>
              <option value="annual">{getLicenseTypeLabel('annual')}</option>
              <option value="lifetime">{getLicenseTypeLabel('lifetime')}</option>
              <option value="custom">{getLicenseTypeLabel('custom')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              الحد الأقصى للأجهزة <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxDevices}
              onChange={(e) => setMaxDevices(parseInt(e.target.value) || 1)}
              className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
            />
          </div>
        </div>

        {/* Start Date & Expiry Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              تاريخ البداية <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              تاريخ الانتهاء <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
            />
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-300 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 shadow-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                <span>جاري الحفظ...</span>
              </>
            ) : (
              <span>إصدار الترخيص</span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
