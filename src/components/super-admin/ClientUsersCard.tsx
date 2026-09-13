import React, { useState } from 'react';
import { ClientUser, ClientUserRole } from '../../types';
import { 
  User, 
  UserPlus, 
  ShieldCheck, 
  Mail, 
  Phone, 
  KeyRound, 
  CheckCircle2, 
  XCircle, 
  MoreVertical,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { getRoleArabicLabel } from '../../lib/permissions';

interface ClientUsersCardProps {
  users: ClientUser[];
  onAddUser: () => void;
  onToggleStatus: (userId: string, currentStatus: string) => void;
}

export function ClientUsersCard({
  users,
  onAddUser,
  onToggleStatus,
}: ClientUsersCardProps) {
  const getRoleBadge = (role: ClientUserRole) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'admin':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'manager':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'cashier':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'inventory':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'accountant':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden text-right" dir="rtl">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">حسابات ومستخدمو المنشأة (Client Users)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            إدارة حسابات الدخول لنقاط البيع ولوحة تحكم العميل ({users.length})
          </p>
        </div>
        <button
          type="button"
          onClick={onAddUser}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>إضافة مستخدم / كاشير</span>
        </button>
      </div>

      {users.length === 0 ? (
        <div className="p-8 text-center">
          <User className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-slate-900">لم يتم تسجيل مستخدمين لهذا العميل</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            قم بإنشاء حساب مالك المنشأة (Owner) أو الكاشير لتسجيل الدخول إلى نقاط البيع والتطبيق.
          </p>
          <button
            type="button"
            onClick={onAddUser}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>إنشاء حساب المالك الآن</span>
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-right">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الاسم</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الدور الوظيفي</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">البريد الإلكتروني</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الهاتف</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الحالة</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">آخر دخول</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900 text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold">
                        {u.name.slice(0, 2)}
                      </div>
                      <span>{u.name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border ${getRoleBadge(u.role)}`}>
                      {getRoleArabicLabel(u.role)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600 font-mono text-right" dir="ltr">
                    {u.email || '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600 font-mono text-right" dir="ltr">
                    {u.phone || '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {u.status === 'active' ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                        نشط
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
                        معطل
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">
                    {u.last_login_at ? format(new Date(u.last_login_at), 'yyyy-MM-dd HH:mm') : 'لم يسجل دخول بعد'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => onToggleStatus(u.id, u.status)}
                      className={u.status === 'active' ? 'text-rose-600 hover:text-rose-800' : 'text-emerald-600 hover:text-emerald-800'}
                    >
                      {u.status === 'active' ? 'تعطيل الحساب' : 'تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
