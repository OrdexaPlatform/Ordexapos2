import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../types';

interface PermissionGuardProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * UI & Action Guard Component
 * Conditionally renders children only if the current user possesses the required permission.
 */
export function PermissionGuard({
  permission,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { hasPermission } = usePermissions();

  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
