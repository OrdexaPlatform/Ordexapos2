import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { provisionClientUser } from '../../lib/userService';
import { ClientUserRole, ClientUserStatus } from '../../types';
import { UserPlus, Shield, Loader2, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';

interface AddClientUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  defaultRole?: ClientUserRole;
  onSuccess: () => void;
}

export function AddClientUserModal({
  isOpen,
  onClose,
  clientId,
  defaultRole = 'owner',
  onSuccess,
}: AddClientUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ClientUserRole>(defaultRole);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('اسم المستخدم مطلوب');
      return;
    }
    if (!email.trim()) {
      toast.error('البريد الإلكتروني مطلوب');
      return;
    }

    setSubmitting(true);
    try {
      await provisionClientUser({
        client_id: clientId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password: password.trim() || undefined,
        role: role,
        status: 'active',
      });

      toast.success('تم إنشاء حساب المستخدم بنجاح');
      onSuccess();
      onClose();
      // Reset form
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
    } catch (err: any) {
      console.error('Error creating user:', err);
      toast.error(err.message || 'فشل في إنشاء الحساب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="إضافة حساب مستخدم / مالك جديد" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4 text-right" dir="rtl">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            اسم المستخدم / الموظف *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: أحمد عبد الله"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              البريد الإلكتروني (لتسجيل الدخول) *
            </label>
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left font-mono focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              رقم الهاتف
            </label>
            <input
              type="text"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+966 50 123 4567"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left font-mono focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              الدور الوظيفي والصلاحيات *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ClientUserRole)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            >
              <option value="owner">مالك المنشأة (Owner - كافة الصلاحيات)</option>
              <option value="admin">مدير نظام (Admin)</option>
              <option value="manager">مدير فرع (Manager)</option>
              <option value="cashier">كاشير (Cashier - البيع والورديات)</option>
              <option value="inventory">مسؤول مخزون (Inventory)</option>
              <option value="accountant">محاسب (Accountant)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              كلمة المرور الأولية (اختياري / 6 خانات فأكثر)
            </label>
            <input
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left font-mono focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
          💡 سيتمكن هذا المستخدم من تسجيل الدخول إلى نقاط البيع الخاصة بالمنشأة وتطبيق سطح المكتب.
        </p>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 shadow-sm"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>حفظ المستخدم</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
