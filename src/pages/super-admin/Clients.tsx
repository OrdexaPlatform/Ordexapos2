import * as React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLogger';
import { Modal } from '../../components/ui/Modal';
import { ClientForm } from './ClientForm';
import { Search, Loader2, MoreVertical, Edit2, ShieldAlert, CheckCircle, Ban, Eye } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export function Clients() {
  const [clients, setClients] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingClient, setEditingClient] = React.useState<any>(null);

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('clients').select('*').order('created_at', { ascending: false });
      
      if (search) {
        query = query.or(`customer_name.ilike.%${search}%,client_code.ilike.%${search}%,business_name.ilike.%${search}%`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('فشل في تحميل بيانات العملاء');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchClients();
  }, [search]);

  const handleStatusChange = async (clientId: string, newStatus: string) => {
    if (!window.confirm(`هل أنت متأكد من تغيير حالة العميل إلى ${newStatus}؟`)) return;

    try {
      const { error } = await supabase
        .from('clients')
        .update({ status: newStatus })
        .eq('id', clientId);

      if (error) throw error;
      
      toast.success('تم تغيير حالة العميل بنجاح');
      
      await logActivity({
        action: 'change_client_status',
        entityType: 'client',
        entityId: clientId,
        metadata: { newStatus }
      });
      
      fetchClients();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('حدث خطأ أثناء تغيير الحالة');
    }
  };

  const openAddModal = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: any) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingClient(null);
  };

  const handleSuccess = () => {
    handleModalClose();
    fetchClients();
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active':
        return <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">نشط</span>;
      case 'inactive':
        return <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">غير نشط</span>;
      case 'suspended':
        return <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">موقوف</span>;
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">إدارة العملاء</h2>
        <button 
          onClick={openAddModal}
          className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm inline-flex items-center justify-center gap-2"
        >
          <span>إضافة عميل جديد</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            className="block w-full rounded-md border-0 py-2 pr-10 pl-3 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6"
            placeholder="بحث بالكود، أو اسم العميل، أو اسم النشاط..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-right">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-sm font-semibold text-slate-900">كود العميل</th>
                <th scope="col" className="px-6 py-3 text-sm font-semibold text-slate-900">بيانات العميل</th>
                <th scope="col" className="px-6 py-3 text-sm font-semibold text-slate-900">النشاط التجاري</th>
                <th scope="col" className="px-6 py-3 text-sm font-semibold text-slate-900">الاتصال</th>
                <th scope="col" className="px-6 py-3 text-sm font-semibold text-slate-900">تاريخ الإضافة</th>
                <th scope="col" className="px-6 py-3 text-sm font-semibold text-slate-900">الحالة</th>
                <th scope="col" className="relative px-6 py-3"><span className="sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-900 mx-auto" />
                    <p className="mt-2 text-sm text-gray-500">جاري تحميل البيانات...</p>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <p className="text-sm text-gray-500">لا يوجد عملاء متاحين حالياً.</p>
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <Link 
                          to={`/super-admin/clients/${client.id}`}
                          className="font-mono bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-xs border border-slate-200 text-slate-900 transition-colors"
                        >
                          {client.client_code}
                        </Link>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <Link 
                        to={`/super-admin/clients/${client.id}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        {client.customer_name}
                      </Link>
                      <div className="text-xs text-gray-500 mt-0.5">{client.owner_name}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-slate-900">{client.business_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{client.business_type || '—'}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-slate-900 text-right" dir="ltr">{client.phone}</div>
                      <div className="text-xs text-gray-500 mt-0.5 text-right" dir="ltr">{client.email || '—'}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {format(new Date(client.created_at), 'yyyy-MM-dd')}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {getStatusBadge(client.status)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-left text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/super-admin/clients/${client.id}`}
                          className="text-slate-400 hover:text-slate-900 transition-colors"
                          title="عرض تفاصيل العميل"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>

                        <button 
                          onClick={() => openEditModal(client)}
                          className="text-slate-400 hover:text-slate-900 transition-colors" 
                          title="تعديل"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        
                        {client.status === 'active' ? (
                          <button 
                            onClick={() => handleStatusChange(client.id, 'suspended')}
                            className="text-amber-500 hover:text-amber-600 transition-colors" 
                            title="إيقاف العميل"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleStatusChange(client.id, 'active')}
                            className="text-green-500 hover:text-green-600 transition-colors" 
                            title="تفعيل العميل"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        title={editingClient ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
        maxWidth="2xl"
      >
        <ClientForm 
          initialData={editingClient} 
          onSuccess={handleSuccess} 
          onCancel={handleModalClose} 
        />
      </Modal>
    </div>
  );
}
