import React, { useState } from 'react';
import { X, Copy, Check, FileCode, Download, Building2, Key, Info } from 'lucide-react';
import { ClientBuildConfig } from '../../types';

interface BuildConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ClientBuildConfig | null;
}

export function BuildConfigModal({ isOpen, onClose, config }: BuildConfigModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !config) return null;

  const jsonString = JSON.stringify(config, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ordexa-config-${config.client.client_code}-v${config.build.version}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                إعدادات إصدار العميل (Client Build Configuration)
              </h3>
              <p className="text-xs text-slate-500">
                كائن التكوين الموحد لـ {config.client.business_name} (v{config.build.version})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block mb-1">المنشأة والعميل</span>
              <span className="text-xs font-bold text-slate-900 block truncate">
                {config.client.business_name}
              </span>
              <span className="text-[10px] font-mono text-slate-500">{config.client.client_code}</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block mb-1">رقم الإصدار</span>
              <span className="text-xs font-bold font-mono text-indigo-600 block">
                v{config.build.version} (Build #{config.build.build_number})
              </span>
              <span className="text-[10px] text-slate-500">{config.build.status}</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block mb-1">حالة الترخيص المرتبط</span>
              {config.license ? (
                <div>
                  <span className="text-xs font-bold text-emerald-700 block">
                    {config.license.license_type} ({config.license.status})
                  </span>
                  <span className="text-[10px] text-slate-500">
                    أقصى أجهزة: {config.license.max_devices}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-amber-600 font-medium">لا يوجد ترخيص مصدر بعد</span>
              )}
            </div>
          </div>

          {/* Info Banner */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
            <Info className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              هذا التكوين يمثل ملف البيانات الرقمي الذي يدمج هوية العميل وترخيصه وإعدادات النظام. لن يتم تنزيل ملف تنفيذي (EXE) في هذه المرحلة.
            </span>
          </div>

          {/* JSON Viewer */}
          <div className="relative rounded-lg border border-slate-800 bg-slate-950 text-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
              <span className="font-mono">client-build-config.json</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400 text-[11px]">تم النسخ!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span className="text-[11px]">نسخ JSON</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <pre
              className="p-4 text-xs font-mono overflow-x-auto text-emerald-400 leading-relaxed max-h-[320px] select-all"
              dir="ltr"
            >
              {jsonString}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>تنزيل ملف الإعدادات (.json)</span>
          </button>
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
