import React from 'react';
import { X, Smartphone, Building2, Key, ShieldCheck, AlertTriangle, Cpu, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Device } from '../../types';
import { Link } from 'react-router-dom';

interface DeviceDetailsModalProps {
  device: Device | null;
  isOpen: boolean;
  onClose: () => void;
  onDeactivate: (device: Device) => void;
}

export function DeviceDetailsModal({
  device,
  isOpen,
  onClose,
  onDeactivate,
}: DeviceDetailsModalProps) {
  if (!isOpen || !device) return null;

  const isActive = device.status === 'active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{device.device_name}</h3>
              <p className="text-xs text-slate-500">تفاصيل الجهاز وسجل التفعيل</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          {/* Status Alert Banner */}
          <div className={`flex items-center justify-between p-3.5 rounded-lg border ${
            isActive ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className="flex items-center gap-2.5">
              {isActive ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-slate-500 shrink-0" />
              )}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider block">
                  {isActive ? 'الجهاز نشط ومرخص' : 'الجهاز معطل / تم تحرير المقعد'}
                </span>
                <span className="text-xs opacity-80">
                  {isActive ? 'يشغل حالياً مقعد ترخيص فعلي بنقاط البيع' : 'لا يشغل مقعداً في الترخيص حالياً'}
                </span>
              </div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
              isActive ? 'bg-emerald-200/80 text-emerald-800' : 'bg-slate-200 text-slate-700'
            }`}>
              {isActive ? 'نشط' : 'معطل'}
            </span>
          </div>

          {/* Fingerprint Card */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-xs font-medium text-slate-500 block mb-1.5">بصمة الجهاز الرقمية (Device Fingerprint)</span>
            <div className="font-mono text-xs text-slate-800 bg-white p-2.5 rounded border border-slate-200 select-all break-all" dir="ltr">
              {device.device_fingerprint}
            </div>
          </div>

          {/* Relationships Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client Info */}
            <div className="p-4 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <span>العميل المرتبط</span>
              </div>
              {device.client ? (
                <div>
                  <Link
                    to={`/super-admin/clients/${device.client_id}`}
                    className="text-sm font-bold text-slate-900 hover:underline block"
                  >
                    {device.client.business_name}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">{device.client.customer_name}</p>
                  <span className="inline-block mt-2 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                    {device.client.client_code}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-mono">{device.client_id}</p>
              )}
            </div>

            {/* License Info */}
            <div className="p-4 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-2">
                <Key className="h-4 w-4 text-slate-400" />
                <span>الترخيص المربوط</span>
              </div>
              {device.license ? (
                <div>
                  <Link
                    to={`/super-admin/licenses/${device.license_id}`}
                    className="font-mono text-xs font-bold text-slate-900 hover:underline block truncate"
                    dir="ltr"
                  >
                    {device.license.license_key}
                  </Link>
                  <p className="text-xs text-slate-500 mt-1">
                    الحد الأقصى: <span className="font-semibold text-slate-800">{device.license.max_devices}</span> أجهزة
                  </p>
                  <span className="inline-block mt-1 text-[11px] text-slate-500">
                    نوع الترخيص: {device.license.license_type}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-mono">{device.license_id}</p>
              )}
            </div>
          </div>

          {/* Technical Specs & Dates */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">نظام التشغيل</span>
              <span className="font-medium text-slate-800">{device.operating_system || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">نسخة التطبيق</span>
              <span className="font-mono font-medium text-slate-800">{device.app_version || 'غير متوفر'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">تاريخ التفعيل</span>
              <span className="text-slate-800 font-mono">
                {device.activated_at ? format(new Date(device.activated_at), 'yyyy-MM-dd') : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">آخر ظهور</span>
              <span className="text-slate-800 font-mono">
                {device.last_seen_at ? format(new Date(device.last_seen_at), 'yyyy-MM-dd HH:mm') : '—'}
              </span>
            </div>
          </div>

          {device.deactivated_at && (
            <div className="text-xs text-slate-500 bg-rose-50 border border-rose-200 p-2.5 rounded-lg flex items-center gap-2">
              <Clock className="h-4 w-4 text-rose-500 shrink-0" />
              <span>
                تاريخ إلغاء التفعيل: <span className="font-mono font-medium text-slate-800">{format(new Date(device.deactivated_at), 'yyyy-MM-dd HH:mm')}</span>
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
          <div>
            {isActive && (
              <button
                type="button"
                onClick={() => {
                  onDeactivate(device);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 transition-colors"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>إلغاء تفعيل هذا الجهاز وتحرير المقعد</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
