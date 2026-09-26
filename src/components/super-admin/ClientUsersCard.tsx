import React, { useState } from 'react';
import { ClientUser, ClientUserRole, ClientUserStatus } from '../../types';
import { 
  User, 
  UserPlus, 
  ShieldCheck, 
  Mail, 
  Phone, 
  CheckCircle2, 
  Plus,
  Power,
  Shield,
  Check,
  X,
  Loader2,
  Edit2
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getRoleArabicLabel, PERMISSION_MODULES, resolveUserPermissions } from '../../lib/permissions';
import { updateClientUser } from '../../lib/userService';

interface ClientUsersCardProps {
  users: ClientUser[];
  onAddUser: () => void;
  onToggleStatus: (userId: string, currentStatus: string) => void;
  onUserUpdated?: () => void;
}

export function ClientUsersCard({
  users,
  onAddUser,
  onToggleStatus,
  onUserUpdated,
}: ClientUsersCardProps) {
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [editingRole, setEditingRole] = useState<ClientUserRole>('cashier');
  const [editingStatus, setEditingStatus] = useState<ClientUserStatus>('active');
  const [isSaving, setIsSaving] = useState(false);

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

  const handleOpenPermissionsModal = (user: ClientUser) => {
    setEditingUser(user);
    setEditingRole(user.role);
    setEditingStatus(user.status);
    const resolved = resolveUserPermissions(user.role, user.custom_permissions);
    setEditingPermissions(
      user.custom_permissions && user.custom_permissions.length > 0
        ? [...user.custom_permissions]
        : Array.from(resolved)
    );
  };

  const handleTogglePermissionChip = (permKey: string) => {
    if (!editingUser || editingRole === 'owner') return;
    setEditingPermissions((prev) => {
      if (prev.includes('*')) {
        const allPerms: string[] = [];
        PERMISSION_MODULES.forEach((m) => {
          m.actions.forEach((a) => allPerms.push(`${m.id}.${a}`));
        });
        return allPerms.filter((p) => p !== permKey);
      }
      if (prev.includes(permKey)) {
        return prev.filter((p) => p !== permKey);
      } else {
        return [...prev, permKey];
      }
    });
  };

  const handleSaveUserPermissions = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    const toastId = toast.loading('جارٍ حفظ التعديلات والصلاحيات...');

    try {
      await updateClientUser(
        editingUser.id,
        editingUser.client_id,
        {
          role: editingRole,
          status: editingStatus,
          custom_permissions: editingPermissions,
        },
        editingUser.role
      );

      toast.success('تم تحديث بيانات وصلاحيات المستخدم بنجاح', { id: toastId });
      setEditingUser(null);
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      console.error('Error saving user permissions:', err);
      toast.error(err.message || 'فشل تحديث بيانات المستخدم', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden text-right" dir="rtl">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">حسابات ومستخدمو المنشأة (Client Users)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            إدارة حسابات الدخول لنقاط البيع، الصلاحيات، وإيقاف/تفعيل الحسابات ({users.length})
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
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الدور والصلاحيات</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">البريد الإلكتروني</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الهاتف</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الحالة</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">آخر دخول</th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900 text-left">إجراءات الحساب</th>
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
                    <button
                      type="button"
                      onClick={() => handleOpenPermissionsModal(u)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border hover:opacity-80 transition-opacity ${getRoleBadge(u.role)}`}
                      title="انقر لتعديل الصلاحيات والدور"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{getRoleArabicLabel(u.role)}</span>
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600 font-mono text-right" dir="ltr">
                    {u.email || '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600 font-mono text-right" dir="ltr">
                    {u.phone || '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {u.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        نشط
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        معطل / موقوف
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">
                    {u.last_login_at ? format(new Date(u.last_login_at), 'yyyy-MM-dd HH:mm') : 'لم يسجل دخول بعد'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPermissionsModal(u)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        title="تعديل الصلاحيات"
                      >
                        <Shield className="h-3.5 w-3.5 text-indigo-600" />
                        <span>الصلاحيات</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleStatus(u.id, u.status)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-semibold transition-all ${
                          u.status === 'active' 
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                        title={u.status === 'active' ? 'إيقاف وتعطيل حساب المستخدم فورياً' : 'تفعيل الحساب فورياً'}
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>{u.status === 'active' ? 'إيقاف الحساب' : 'تفعيل'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Permissions & Role Edit Modal for Super Admin */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">إدارة صلاحيات وحالة: {editingUser.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{editingUser.email || editingUser.phone}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {/* Quick Settings: Role & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    الدور الوظيفي الأساسي
                  </label>
                  <select
                    value={editingRole}
                    onChange={(e) => {
                      const newRole = e.target.value as ClientUserRole;
                      setEditingRole(newRole);
                      const resolved = resolveUserPermissions(newRole);
                      setEditingPermissions(Array.from(resolved));
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 text-xs bg-white focus:outline-none focus:border-indigo-600"
                  >
                    <option value="cashier">كاشير (نقطة البيع)</option>
                    <option value="manager">مدير تشغيل</option>
                    <option value="admin">مدير نظام</option>
                    <option value="inventory">مسؤول مخزون</option>
                    <option value="accountant">محاسب مالي</option>
                    <option value="owner">مالك المنشأة (كافة الصلاحيات)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    حالة الحساب
                  </label>
                  <select
                    value={editingStatus}
                    onChange={(e) => setEditingStatus(e.target.value as ClientUserStatus)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 text-xs bg-white focus:outline-none focus:border-indigo-600"
                  >
                    <option value="active">نشط (مسموح بالدخول والعمل)</option>
                    <option value="inactive">معطل وموقوف (ممنوع تسجيل الدخول)</option>
                  </select>
                </div>
              </div>

              {/* Interactive Permissions Matrix */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                    <span>تخصيص الصلاحيات الممنوحة (انقر على الصلاحية للتبديل)</span>
                  </div>
                  <span className="text-slate-500 text-[11px]">
                    {editingRole === 'owner' ? 'المالك يمتلك كامل الصلاحيات' : 'انقر على أي صلاحية لتفعيلها أو سحبها'}
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {PERMISSION_MODULES.map((mod) => {
                    const isModAllowed = editingPermissions.includes('*') || editingPermissions.includes(`${mod.id}.*`);

                    return (
                      <div key={mod.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/50">
                        <div>
                          <div className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                            <span>{mod.label}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({mod.id})</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{mod.description}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {mod.actions.map((act) => {
                            const permKey = `${mod.id}.${act}`;
                            const isAllowed = isModAllowed || editingPermissions.includes(permKey);

                            return (
                              <button
                                key={act}
                                type="button"
                                disabled={editingRole === 'owner'}
                                onClick={() => handleTogglePermissionChip(permKey)}
                                title={isAllowed ? 'مفعلة - انقر للإلغاء' : 'معطلة - انقر للمنح'}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono border transition-all cursor-pointer ${
                                  isAllowed
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold shadow-xs'
                                    : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 line-through hover:opacity-100'
                                } disabled:cursor-not-allowed`}
                              >
                                {isAllowed ? <Check className="h-3 w-3 text-emerald-600" /> : <X className="h-3 w-3 text-slate-400" />}
                                <span>{act}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">
                سيتم تطبيق حالة الحساب والصلاحيات فوراً في النظام.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveUserPermissions}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>حفظ التعديلات والحالة</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
