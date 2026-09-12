import React from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission, PermissionModule } from '../../types';
import { PERMISSION_MODULES, getRoleArabicLabel } from '../../lib/permissions';
import { ShieldAlert, ArrowRight, Lock } from 'lucide-react';

interface ModuleRouteGuardProps {
  module: PermissionModule;
  requiredPermission?: Permission;
  children: React.ReactNode;
}

export function ModuleRouteGuard({
  module,
  requiredPermission,
  children,
}: ModuleRouteGuardProps) {
  const { canAccessModule, hasPermission, role, isSuperAdmin } = usePermissions();

  if (isSuperAdmin) {
    return <>{children}</>;
  }

  const hasModuleAccess = canAccessModule(module);
  const hasSpecificAccess = requiredPermission ? hasPermission(requiredPermission) : true;

  if (hasModuleAccess && hasSpecificAccess) {
    return <>{children}</>;
  }

  // Find module meta for friendly Arabic label
  const moduleMeta = PERMISSION_MODULES.find((m) => m.id === module);
  const moduleName = moduleMeta ? moduleMeta.label : module;
  const roleName = role ? getRoleArabicLabel(role) : 'مستخدم';

  return (
    <div className="max-w-xl mx-auto py-12 px-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-rose-200 p-8 shadow-sm text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 mb-3">
          <Lock className="h-3.5 w-3.5" />
          <span>خطأ 403: الوصول مقيد</span>
        </div>

        <h1 className="text-xl font-bold text-slate-900 mb-2">
          غير مصرح لك بالوصول إلى قسم {moduleName}
        </h1>

        <p className="text-slate-600 text-sm leading-relaxed mb-6">
          حسابك الحالي بصلاحية <strong className="text-slate-900">({roleName})</strong> لا يمتلك الصلاحيات الكافية للوصول إلى هذا القسم أو تنفيذ عملياته. إذا كنت بحاجة لهذا القسم لمباشرة عملك، يرجى التواصل مع مالك أو مدير المنشأة.
        </p>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 mb-6 font-mono">
          Required Module: {module} {requiredPermission ? `(${requiredPermission})` : ''}
        </div>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
        >
          <span>العودة إلى لوحة التحكم</span>
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}
