import React, { useState, useEffect, useCallback } from 'react';
import { useClientStore } from '../../store/clientStore';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../hooks/usePermissions';
import { PermissionGuard } from '../../components/client/PermissionGuard';
import { 
  fetchClientUsers, 
  provisionClientUser, 
  updateClientUser, 
  toggleClientUserStatus 
} from '../../lib/userService';
import { ClientUser, ClientUserRole, ClientUserStatus } from '../../types';
import { 
  getRoleArabicLabel, 
  PERMISSION_MODULES, 
  resolveUserPermissions 
} from '../../lib/permissions';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  MoreVertical, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Edit, 
  Power, 
  Shield, 
  Mail, 
  Phone, 
  KeyRound, 
  RefreshCw, 
  Check, 
  X, 
  AlertTriangle,
  Lock,
  UserCheck,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export function StaffPage() {
  const { client } = useClientStore();
  const { clientUser: currentLoggedInUser } = useAuthStore();
  const { hasPermission } = usePermissions();

  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals & Drawers state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ClientUser | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'cashier' as ClientUserRole,
    status: 'active' as ClientUserStatus,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load users
  const loadUsers = useCallback(async () => {
    if (!client?.id) return;
    try {
      setLoading(true);
      const data = await fetchClientUsers(client.id, {
        search: searchQuery,
        role: roleFilter,
        status: statusFilter,
      });
      setUsers(data);
    } catch (err: any) {
      toast.error('تعذر تحميل قائمة الموظفين');
    } finally {
      setLoading(false);
    }
  }, [client?.id, searchQuery, roleFilter, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Statistics calculation
  const totalCount = users.length;
  const activeCount = users.filter((u) => u.status === 'active').length;
  const inactiveCount = users.filter((u) => u.status === 'inactive').length;
  const cashierCount = users.filter((u) => u.role === 'cashier').length;

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: 'cashier',
      status: 'active',
    });
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (user: ClientUser) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      role: user.role,
      status: user.status,
    });
    setIsEditModalOpen(true);
  };

  // Permissions Editing & Status Loading States
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [togglingStatusUserId, setTogglingStatusUserId] = useState<string | null>(null);

  // Open Details Modal
  const handleOpenDetails = (user: ClientUser) => {
    setSelectedUser(user);
    const resolved = resolveUserPermissions(user.role, user.custom_permissions);
    setEditingPermissions(
      user.custom_permissions && user.custom_permissions.length > 0
        ? [...user.custom_permissions]
        : Array.from(resolved)
    );
    setIsDetailsModalOpen(true);
  };

  // Toggle individual permission action chip
  const handleTogglePermissionChip = (permKey: string) => {
    if (!selectedUser || selectedUser.role === 'owner') return;
    setEditingPermissions((prev) => {
      if (prev.includes('*')) {
        // If wildcard exists, expand all permissions then remove this one
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

  // Save modified custom permissions
  const handleSavePermissions = async () => {
    if (!client?.id || !selectedUser) return;
    setIsSavingPermissions(true);
    const toastId = toast.loading('جارٍ حفظ الصلاحيات المحدثة...');
    try {
      const updated = await updateClientUser(
        selectedUser.id,
        client.id,
        {
          name: selectedUser.name,
          phone: selectedUser.phone,
          role: selectedUser.role,
          status: selectedUser.status,
          custom_permissions: editingPermissions,
        },
        selectedUser.role
      );

      toast.success('تم حفظ الصلاحيات وتحديثها بنجاح', { id: toastId });
      setSelectedUser(updated);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err: any) {
      console.error('Error saving permissions:', err);
      toast.error(err.message || 'فشل حفظ الصلاحيات', { id: toastId });
    } finally {
      setIsSavingPermissions(false);
    }
  };

  // Submit Add User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      toast.error('يرجى إدخال اسم صحيح للمستخدم (حرفين على الأقل)');
      return;
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      toast.error('يرجى إدخال بريد إلكتروني صالح');
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      toast.error('كلمة المرور يجب أن لا تقل عن 6 أحرف');
      return;
    }

    try {
      setSubmitting(true);
      const res = await provisionClientUser({
        client_id: client.id,
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
        role: formData.role,
        status: formData.status,
      });

      toast.success(res.message || 'تمت إضافة المستخدم بنجاح');
      setIsAddModalOpen(false);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'فشلت إضافة المستخدم');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Edit User
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id || !selectedUser) return;

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      toast.error('يرجى إدخال اسم صحيح للمستخدم');
      return;
    }

    try {
      setSubmitting(true);
      await updateClientUser(
        selectedUser.id,
        client.id,
        {
          name: formData.name,
          phone: formData.phone,
          role: formData.role,
          status: formData.status,
        },
        selectedUser.role
      );

      toast.success('تم تحديث بيانات المستخدم بنجاح');
      setIsEditModalOpen(false);
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'فشل تحديث المستخدم');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle User Activation Status (Suspending / Activating)
  const handleToggleStatus = async (user: ClientUser) => {
    if (!client?.id) return;
    if (user.id === currentLoggedInUser?.id) {
      toast.error('لا يمكنك تعطيل حسابك الشخصي الحالي');
      return;
    }

    const nextStatus: ClientUserStatus = user.status === 'active' ? 'inactive' : 'active';
    const actionText = nextStatus === 'active' ? 'تفعيل' : 'إيقاف وتعطيل';
    setTogglingStatusUserId(user.id);
    const toastId = toast.loading(`جارٍ ${actionText} الحساب...`);

    try {
      const updatedUser = await toggleClientUserStatus(user.id, client.id, nextStatus);
      toast.success(`تم ${actionText} حساب ${user.name} بنجاح`, { id: toastId });

      // Immediate optimistic state sync
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
      );
      if (selectedUser && selectedUser.id === user.id) {
        setSelectedUser({ ...selectedUser, status: nextStatus });
      }

      loadUsers();
    } catch (err: any) {
      console.error('Error toggling status:', err);
      toast.error(err.message || `فشل ${actionText} الحساب`, { id: toastId });
    } finally {
      setTogglingStatusUserId(null);
    }
  };

  // Generate a random secure password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, password: pass }));
  };

  const getRoleBadgeStyle = (role: ClientUserRole) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'admin':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'manager':
        return 'bg-blue-50 text-blue-700 border-blue-200';
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
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">إدارة المستخدمين والموظفين</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                إدارة حسابات مستخدمي المنشأة، تعيين الصلاحيات، ومتابعة تسجيل الدخول
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadUsers}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          <PermissionGuard permission="staff.create">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shadow-sm transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              <span>إضافة مستخدم جديد</span>
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* 2. Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block">إجمالي المستخدمين</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{totalCount}</span>
            <span className="text-xs text-slate-400">حساب</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-emerald-600 block font-medium">الحسابات النشطة</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-700">{activeCount}</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block">الحسابات المعطلة</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-600">{inactiveCount}</span>
            <span className="h-2 w-2 rounded-full bg-slate-300" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-indigo-600 block font-medium">طاقم الكاشير</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-indigo-700">{cashierCount}</span>
            <span className="text-xs text-indigo-500 font-mono">POS</span>
          </div>
        </div>
      </div>

      {/* 3. Filters & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو البريد أو الهاتف..."
            className="w-full rounded-lg border border-slate-200 ps-9 pe-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
          <Search className="h-4 w-4 text-slate-400 absolute start-3 top-2.5" />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="h-3.5 w-3.5" />
            <span>الدور:</span>
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-600"
          >
            <option value="all">كل الأدوار</option>
            <option value="owner">مالك المنشأة</option>
            <option value="admin">مدير النظام</option>
            <option value="manager">مدير فرع</option>
            <option value="cashier">كاشير</option>
            <option value="inventory">مسؤول مخزون</option>
            <option value="accountant">محاسب</option>
          </select>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>الحالة:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-600"
          >
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">معطل</option>
          </select>
        </div>
      </div>

      {/* 4. Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                <th className="py-3 px-4 text-start">المستخدم</th>
                <th className="py-3 px-4 text-start">البريد الإلكتروني</th>
                <th className="py-3 px-4 text-start">رقم الهاتف</th>
                <th className="py-3 px-4 text-start">الدور</th>
                <th className="py-3 px-4 text-start">الحالة</th>
                <th className="py-3 px-4 text-start">آخر تسجيل دخول</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-slate-800 mb-2" />
                    <p>جارٍ تحميل بيانات المستخدمين...</p>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-800">لا يوجد مستخدمون مطابقون</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      يمكنك إضافة مستخدم جديد أو تعديل معايير البحث
                    </p>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isCurrent = user.id === currentLoggedInUser?.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Initials */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs">
                            {user.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                              {user.name}
                              {isCurrent && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 rounded font-normal">
                                  أنت
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {user.id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4 font-mono text-slate-700 text-left ltr">
                        {user.email || '---'}
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 font-mono text-slate-700 text-left ltr">
                        {user.phone || '---'}
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold border ${getRoleBadgeStyle(
                            user.role
                          )}`}
                        >
                          {getRoleArabicLabel(user.role)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {user.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            نشط
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            معطل
                          </span>
                        )}
                      </td>

                      {/* Last login */}
                      <td className="py-3 px-4 text-slate-500">
                        {user.last_login_at
                          ? format(new Date(user.last_login_at), 'yyyy-MM-dd HH:mm')
                          : 'لم يسجل دخول بعد'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View details */}
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(user)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="عرض التفاصيل والصلاحيات"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Edit user */}
                          <PermissionGuard permission="staff.edit">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(user)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="تعديل المستخدم"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          </PermissionGuard>

                          {/* Toggle Active/Inactive */}
                          <PermissionGuard permission="staff.manage">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(user)}
                              disabled={isCurrent || togglingStatusUserId === user.id}
                              className={`p-1.5 rounded-lg transition-colors ${
                                user.status === 'active'
                                  ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                                  : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                              } disabled:opacity-40`}
                              title={user.status === 'active' ? 'إيقاف / تعطيل الحساب' : 'تفعيل الحساب'}
                            >
                              {togglingStatusUserId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. ADD USER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">إضافة مستخدم جديد للمنشأة</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4 text-xs">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  الاسم الكامل <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: أحمد محمود"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  البريد الإلكتروني (لتسجيل الدخول) <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@business.com"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm ltr text-left"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الهاتف (اختياري)
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+966 50 000 0000"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm ltr text-left"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    كلمة المرور الأولية <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    توليد كلمة مرور عشوائية
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="لا تقل عن 6 أحرف"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm ltr text-left pe-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Role */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الدور الوظيفي <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as ClientUserRole })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm bg-white"
                  >
                    <option value="cashier">كاشير (نقطة البيع)</option>
                    <option value="manager">مدير فرع / تشغيل</option>
                    <option value="admin">مدير نظام المنشأة</option>
                    <option value="inventory">مسؤول مخزون</option>
                    <option value="accountant">محاسب مالي</option>
                    <option value="owner">مالك المنشأة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    حالة الحساب <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ClientUserStatus })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm bg-white"
                  >
                    <option value="active">نشط ومفعل</option>
                    <option value="inactive">معطل مؤقتاً</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'جارٍ الإنشاء...' : 'حفظ وإضافة المستخدم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. EDIT USER MODAL */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">تعديل بيانات المستخدم</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  البريد الإلكتروني (مرتبط بحساب تسجيل الدخول)
                </label>
                <input
                  type="email"
                  disabled
                  value={formData.email}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-slate-400 bg-slate-50 text-sm ltr text-left cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الهاتف
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm ltr text-left"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  الدور الوظيفي
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as ClientUserRole })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm bg-white"
                >
                  <option value="cashier">كاشير (نقطة البيع)</option>
                  <option value="manager">مدير فرع / تشغيل</option>
                  <option value="admin">مدير نظام المنشأة</option>
                  <option value="inventory">مسؤول مخزون</option>
                  <option value="accountant">محاسب مالي</option>
                  <option value="owner">مالك المنشأة</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  حالة الحساب
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as ClientUserStatus })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-600 text-sm bg-white"
                >
                  <option value="active">نشط (مسموح بالدخول والعمل)</option>
                  <option value="inactive">معطل / موقوف (محظور تسجيل الدخول)</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'جارٍ التحديث...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. USER DETAILS & PERMISSION MATRIX MODAL */}
      {isDetailsModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm">
                  {selectedUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{selectedUser.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getRoleBadgeStyle(selectedUser.role)}`}>
                      {getRoleArabicLabel(selectedUser.role)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">ID: {selectedUser.id}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedUser.id !== currentLoggedInUser?.id && (
                  <button
                    type="button"
                    disabled={togglingStatusUserId === selectedUser.id}
                    onClick={() => handleToggleStatus(selectedUser)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shadow-xs ${
                      selectedUser.status === 'active'
                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                    title={selectedUser.status === 'active' ? 'إيقاف حساب المستخدم فورياً' : 'تفعيل الحساب فورياً'}
                  >
                    {togglingStatusUserId === selectedUser.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="h-3.5 w-3.5" />
                    )}
                    <span>{selectedUser.status === 'active' ? 'إيقاف / تعطيل الحساب' : 'تفعيل الحساب الآن'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {/* User Overview Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">البريد الإلكتروني</span>
                  <span className="font-bold text-slate-800 font-mono mt-0.5 block">{selectedUser.email || '---'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">رقم الهاتف</span>
                  <span className="font-bold text-slate-800 font-mono mt-0.5 block">{selectedUser.phone || '---'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">حالة الحساب</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`font-bold inline-flex items-center gap-1 ${selectedUser.status === 'active' ? 'text-emerald-700' : 'text-rose-600'}`}>
                      <span className={`h-2 w-2 rounded-full ${selectedUser.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {selectedUser.status === 'active' ? 'نشط' : 'معطل وموقوف'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 block">تاريخ الإضافة</span>
                  <span className="text-slate-800 mt-0.5 block">
                    {format(new Date(selectedUser.created_at), 'yyyy-MM-dd')}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block">آخر تسجيل دخول</span>
                  <span className="text-slate-800 mt-0.5 block font-mono">
                    {selectedUser.last_login_at
                      ? format(new Date(selectedUser.last_login_at), 'yyyy-MM-dd HH:mm:ss')
                      : 'لم يتم تسجيل الدخول بعد'}
                  </span>
                </div>
              </div>

              {/* Resolved Permissions Matrix Display & Editor */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <Shield className="h-4 w-4 text-indigo-600" />
                    <span>مصفوفة الصلاحيات الممنوحة (انقر على الصلاحية لمنحها أو سحبها)</span>
                  </div>
                  <span className="text-slate-500 text-[11px]">
                    {selectedUser.role === 'owner' ? 'مالك المنشأة (صلاحيات كاملة شاملة)' : 'انقر على الصلاحيات لتعديلها ثم اضغط حفظ'}
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {PERMISSION_MODULES.map((mod) => {
                    const isModuleAllAllowed = editingPermissions.includes('*') || editingPermissions.includes(`${mod.id}.*`);

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
                            const isActionAllowed = isModuleAllAllowed || editingPermissions.includes(permKey);

                            return (
                              <button
                                key={act}
                                type="button"
                                disabled={selectedUser.role === 'owner'}
                                onClick={() => handleTogglePermissionChip(permKey)}
                                title={
                                  selectedUser.role === 'owner'
                                    ? 'المالك يمتلك كامل الصلاحيات'
                                    : isActionAllowed
                                    ? 'مفعّلة - انقر لسحب هذه الصلاحية'
                                    : 'معطلة - انقر لمنح هذه الصلاحية'
                                }
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all cursor-pointer ${
                                  isActionAllowed
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-bold shadow-xs'
                                    : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 line-through hover:opacity-100 hover:border-slate-300'
                                } disabled:cursor-not-allowed`}
                              >
                                {isActionAllowed ? <Check className="h-3 w-3 text-emerald-600" /> : <X className="h-3 w-3 text-slate-400" />}
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

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                {selectedUser.role !== 'owner' ? (
                  <span className="text-[11px] text-slate-600">
                    يمكنك تعديل الصلاحيات الفردية أعلاه ثم النقر على <strong>حفظ الصلاحيات</strong> لتطبيقها فوراً.
                  </span>
                ) : (
                  <span className="text-[11px] text-purple-700 font-semibold">
                    حساب مالك المنشأة يتمتع بجميع الصلاحيات بشكل افتراضي دائم.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
                >
                  إغلاق النافذة
                </button>
                {selectedUser.role !== 'owner' && (
                  <button
                    type="button"
                    disabled={isSavingPermissions}
                    onClick={handleSavePermissions}
                    className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    {isSavingPermissions && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>حفظ الصلاحيات المحدثة</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
