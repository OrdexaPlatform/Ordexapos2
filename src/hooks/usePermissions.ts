import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { 
  hasPermission as checkHasPermission, 
  canAccessModule as checkCanAccessModule, 
  resolveUserPermissions 
} from '../lib/permissions';
import { Permission, PermissionModule, PermissionAction } from '../types';

export function usePermissions() {
  const { clientUser, isSuperAdmin } = useAuthStore();

  const role = clientUser?.role;
  const customPermissions = clientUser?.custom_permissions;

  const permissionsSet = useMemo(() => {
    if (isSuperAdmin) {
      return new Set<string>(['*']);
    }
    return resolveUserPermissions(role, customPermissions);
  }, [role, customPermissions, isSuperAdmin]);

  const hasPermission = (permission: Permission): boolean => {
    if (isSuperAdmin) return true;
    return checkHasPermission(role, customPermissions, permission);
  };

  const canAccessModule = (module: PermissionModule): boolean => {
    if (isSuperAdmin) return true;
    return checkCanAccessModule(role, customPermissions, module);
  };

  const can = (action: PermissionAction, module: PermissionModule): boolean => {
    return hasPermission(`${module}.${action}` as Permission);
  };

  return {
    role,
    customPermissions,
    permissionsSet,
    hasPermission,
    canAccessModule,
    can,
    isSuperAdmin,
    isOwner: role === 'owner',
    isAdmin: role === 'admin' || role === 'owner',
    isManager: role === 'manager',
    isCashier: role === 'cashier',
  };
}
