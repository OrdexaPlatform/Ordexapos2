import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';

export interface LogActivityParams {
  action: 
    | 'user_created'
    | 'user_updated'
    | 'user_activated'
    | 'user_deactivated'
    | 'user_login'
    | 'user_role_changed'
    | 'product_created'
    | 'product_updated'
    | 'product_deleted'
    | 'product_activated'
    | 'product_deactivated'
    | 'stock_opening'
    | 'stock_adjustment'
    | 'stock_transfer'
    | 'warehouse_created'
    | 'warehouse_updated'
    | 'sale_created'
    | 'sale_voided'
    | 'payment_recorded'
    | 'invoice_printed'
    | string;
  entityType: string;
  entityId?: string;
  actorType?: 'super_admin' | 'client_device' | 'system' | 'client_user';
  actorId?: string;
  metadata?: Record<string, any>;
}

export async function logActivity({
  action,
  entityType,
  entityId,
  actorType,
  actorId,
  metadata
}: LogActivityParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const authStoreState = useAuthStore.getState();

    // Determine actor type and ID
    let resolvedActorType: 'super_admin' | 'client_device' | 'system' | 'client_user' = 
      actorType || (authStoreState.isSuperAdmin ? 'super_admin' : 'client_user');
    let resolvedActorId = actorId || user?.id;

    if (!resolvedActorId && !user) {
      console.warn('Cannot log activity: No user authenticated');
      return;
    }

    // Sanitize metadata to guarantee no passwords or secrets are ever recorded
    const cleanMetadata = metadata ? { ...metadata } : {};
    delete cleanMetadata.password;
    delete cleanMetadata.new_password;
    delete cleanMetadata.token;
    delete cleanMetadata.service_role_key;

    // Attach client context if available
    if (authStoreState.clientUser?.client_id && !cleanMetadata.client_id) {
      cleanMetadata.client_id = authStoreState.clientUser.client_id;
    }

    await supabase.from('activity_logs').insert({
      actor_type: resolvedActorType,
      actor_id: resolvedActorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: cleanMetadata,
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
