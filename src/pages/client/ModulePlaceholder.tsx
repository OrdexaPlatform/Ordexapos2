import { LucideIcon, Hammer, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ModulePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  badgeText?: string;
}

export function ModulePlaceholder({
  title,
  description,
  icon: Icon,
  badgeText = 'قيد التطوير في المراحل القادمة',
}: ModulePlaceholderProps) {
  return (
    <div className="max-w-4xl mx-auto py-8" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 shadow-sm text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 mb-6 shadow-sm">
          <Icon className="h-10 w-10" />
        </div>

        <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 mb-4">
          <div className="flex items-center gap-1.5">
            <Hammer className="h-3.5 w-3.5" />
            <span>{badgeText}</span>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">{title}</h1>
        
        <p className="text-slate-600 text-sm sm:text-base max-w-xl mx-auto leading-relaxed mb-8">
          {description}
        </p>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 max-w-md mx-auto text-xs text-slate-500 mb-8 leading-relaxed">
          تم تأسيس الهيكل الأساسي للربط مع نظام الصلاحيات ومستخدمي العميل (Phase 6 Foundation). وسيتم بناء الشاشات والوظائف التفاعلية لهذا القسم في المرحلة المخصصة له.
        </div>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
        >
          <span>العودة للرئيسية</span>
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}
