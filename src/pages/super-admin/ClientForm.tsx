import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLogger';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

const clientSchema = z.object({
  customer_name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  business_name: z.string().min(2, 'اسم النشاط مطلوب'),
  business_type: z.string().optional(),
  owner_name: z.string().optional(),
  phone: z.string().min(5, 'رقم الهاتف مطلوب'),
  email: z.string().email('البريد الإلكتروني غير صحيح').optional().or(z.literal('')),
  address: z.string().optional(),
  currency: z.string(),
  language: z.string(),
  status: z.enum(['active', 'inactive', 'suspended']),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface ClientFormProps {
  initialData?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

// Simple unique ID generator for client_code
const generateClientCode = () => {
  return `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
};

export function ClientForm({ initialData, onSuccess, onCancel }: ClientFormProps) {
  const isEditing = !!initialData;
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema) as any,
    defaultValues: initialData || {
      currency: 'USD',
      language: 'ar',
      status: 'active',
      email: '',
      phone: '',
      business_type: '',
      owner_name: '',
      address: '',
    },
  });

  const onSubmit = async (data: ClientFormData) => {
    setIsSubmitting(true);
    try {
      if (isEditing) {
        const { error } = await supabase
          .from('clients')
          .update({
            ...data,
            // Only send empty strings as null for optional fields if strict db requires, but empty string should be fine.
            email: data.email || null,
          })
          .eq('id', initialData.id);

        if (error) throw error;
        toast.success('تم تحديث بيانات العميل بنجاح');
        await logActivity({
          action: 'update_client',
          entityType: 'client',
          entityId: initialData.id,
          metadata: { changes: data },
        });
      } else {
        const clientCode = generateClientCode();
        const { data: newClient, error } = await supabase
          .from('clients')
          .insert({
            ...data,
            client_code: clientCode,
            email: data.email || null,
          })
          .select('id')
          .single();

        if (error) throw error;
        toast.success('تم إضافة العميل بنجاح');
        await logActivity({
          action: 'create_client',
          entityType: 'client',
          entityId: newClient?.id,
          metadata: { client_code: clientCode, ...data },
        });
      }
      onSuccess();
    } catch (error: any) {
      console.error('Error saving client:', error);
      toast.error(error.message || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium leading-6 text-slate-900">
            اسم العميل *
          </label>
          <input
            type="text"
            {...register('customer_name')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6"
          />
          {errors.customer_name && (
            <p className="mt-1 text-sm text-red-500">{errors.customer_name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium leading-6 text-slate-900">
            اسم النشاط (Business Name) *
          </label>
          <input
            type="text"
            {...register('business_name')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6"
          />
          {errors.business_name && (
            <p className="mt-1 text-sm text-red-500">{errors.business_name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium leading-6 text-slate-900">
            نوع النشاط
          </label>
          <input
            type="text"
            {...register('business_type')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6"
          />
        </div>

        <div>
          <label className="block text-sm font-medium leading-6 text-slate-900">
            اسم المالك / المسؤول
          </label>
          <input
            type="text"
            {...register('owner_name')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6"
          />
        </div>

        <div>
          <label className="block text-sm font-medium leading-6 text-slate-900">
            رقم الهاتف *
          </label>
          <input
            type="text"
            dir="ltr"
            {...register('phone')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6 text-left"
          />
          {errors.phone && (
            <p className="mt-1 text-sm text-red-500">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium leading-6 text-slate-900">
            البريد الإلكتروني
          </label>
          <input
            type="email"
            dir="ltr"
            {...register('email')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6 text-left"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium leading-6 text-slate-900">
            العنوان
          </label>
          <textarea
            rows={2}
            {...register('address')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6"
          />
        </div>

        <div>
          <label className="block text-sm font-medium leading-6 text-slate-900">
            العملة
          </label>
          <select
            {...register('currency')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6"
          >
            <option value="USD">دولار أمريكي (USD)</option>
            <option value="SAR">ريال سعودي (SAR)</option>
            <option value="AED">درهم إماراتي (AED)</option>
            <option value="EGP">جنيه مصري (EGP)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium leading-6 text-slate-900">
            الحالة
          </label>
          <select
            {...register('status')}
            className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6"
          >
            <option value="active">نشط (Active)</option>
            <option value="inactive">غير نشط (Inactive)</option>
            <option value="suspended">موقوف (Suspended)</option>
          </select>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-x-6 border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-sm font-semibold leading-6 text-slate-900 hover:text-slate-700"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-70 flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEditing ? 'تحديث العميل' : 'إضافة العميل'}
        </button>
      </div>
    </form>
  );
}
