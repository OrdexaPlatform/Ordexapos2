import * as React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'md' }: ModalProps) {
  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-3xl',
    '4xl': 'sm:max-w-4xl',
    '5xl': 'sm:max-w-5xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
        aria-hidden="true" 
        onClick={onClose} 
      />
      
      <div 
        className={`relative w-full ${maxWidthClasses[maxWidth]} transform rounded-xl bg-white text-right shadow-2xl transition-all max-h-[90vh] flex flex-col`}
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
            onClick={onClose}
          >
            <span className="sr-only">إغلاق</span>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
