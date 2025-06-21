/**
 * Role-Based Access Control (RBAC) Types
 * 
 * Defines permissions, roles, and access control structures
 * for enterprise-grade security management
 */

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
  category: string;
  createdAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[]; // Permission IDs
  isSystem: boolean; // Cannot be deleted/modified
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

// Permission categories
export enum PermissionCategory {
  SERVERS = 'servers',
  METRICS = 'metrics',
  USERS = 'users',
  SYSTEM = 'system',
  AI = 'ai',
  AUDIT = 'audit',
  ADMIN = 'admin'
}

// Standard actions
export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXECUTE = 'execute',
  MANAGE = 'manage'
}

// System roles
export enum SystemRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
  AI_USER = 'ai_user'
}

// Access check result
export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermissions: string[];
  userPermissions: string[];
  missingPermissions: string[];
}

// RBAC context for requests
export interface RBACContext {
  userId: string;
  roles: Role[];
  permissions: Permission[];
  sessionId: string;
  clientIP: string;
  userAgent: string;
}

// Default system permissions
export const SYSTEM_PERMISSIONS: Omit<Permission, 'id' | 'createdAt'>[] = [
  // Server permissions
  { name: 'servers:create', resource: 'servers', action: 'create', description: 'Create new MCP servers', category: PermissionCategory.SERVERS },
  { name: 'servers:read', resource: 'servers', action: 'read', description: 'View MCP servers', category: PermissionCategory.SERVERS },
  { name: 'servers:update', resource: 'servers', action: 'update', description: 'Update MCP servers', category: PermissionCategory.SERVERS },
  { name: 'servers:delete', resource: 'servers', action: 'delete', description: 'Delete MCP servers', category: PermissionCategory.SERVERS },
  { name: 'servers:manage', resource: 'servers', action: 'manage', description: 'Full server management', category: PermissionCategory.SERVERS },
  
  // Metrics permissions
  { name: 'metrics:read', resource: 'metrics', action: 'read', description: 'View metrics and analytics', category: PermissionCategory.METRICS },
  { name: 'metrics:export', resource: 'metrics', action: 'execute', description: 'Export metrics data', category: PermissionCategory.METRICS },
  
  // User management permissions
  { name: 'users:create', resource: 'users', action: 'create', description: 'Create user accounts', category: PermissionCategory.USERS },
  { name: 'users:read', resource: 'users', action: 'read', description: 'View user accounts', category: PermissionCategory.USERS },
  { name: 'users:update', resource: 'users', action: 'update', description: 'Update user accounts', category: PermissionCategory.USERS },
  { name: 'users:delete', resource: 'users', action: 'delete', description: 'Delete user accounts', category: PermissionCategory.USERS },
  { name: 'users:manage_roles', resource: 'users', action: 'manage', description: 'Assign and manage user roles', category: PermissionCategory.USERS },
  
  // System permissions
  { name: 'system:read', resource: 'system', action: 'read', description: 'View system information', category: PermissionCategory.SYSTEM },
  { name: 'system:configure', resource: 'system', action: 'update', description: 'Configure system settings', category: PermissionCategory.SYSTEM },
  { name: 'system:maintenance', resource: 'system', action: 'execute', description: 'Perform system maintenance', category: PermissionCategory.SYSTEM },
  
  // AI permissions
  { name: 'ai:read', resource: 'ai', action: 'read', description: 'View AI status and capabilities', category: PermissionCategory.AI },
  { name: 'ai:analyze', resource: 'ai', action: 'execute', description: 'Run AI analysis operations', category: PermissionCategory.AI },
  { name: 'ai:chat', resource: 'ai', action: 'execute', description: 'Use AI chat assistant', category: PermissionCategory.AI },
  { name: 'ai:predict', resource: 'ai', action: 'execute', description: 'Generate AI predictions', category: PermissionCategory.AI },
  
  // Audit permissions
  { name: 'audit:read', resource: 'audit', action: 'read', description: 'View audit logs', category: PermissionCategory.AUDIT },
  { name: 'audit:export', resource: 'audit', action: 'execute', description: 'Export audit data', category: PermissionCategory.AUDIT },
  
  // Admin permissions
  { name: 'admin:full_access', resource: 'admin', action: 'manage', description: 'Full administrative access', category: PermissionCategory.ADMIN },
  { name: 'admin:rbac_manage', resource: 'admin', action: 'manage', description: 'Manage roles and permissions', category: PermissionCategory.ADMIN }
];

// Default system roles with their permissions
export const SYSTEM_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[] = [
  {
    name: 'Super Administrator',
    description: 'Full system access with all permissions',
    permissions: ['admin:full_access'],
    isSystem: true
  },
  {
    name: 'Administrator',
    description: 'Administrative access to most system functions',
    permissions: [
      'servers:manage', 'metrics:read', 'metrics:export',
      'users:create', 'users:read', 'users:update', 'users:delete', 'users:manage_roles',
      'system:read', 'system:configure', 'system:maintenance',
      'ai:read', 'ai:analyze', 'ai:chat', 'ai:predict',
      'audit:read', 'audit:export', 'admin:rbac_manage'
    ],
    isSystem: true
  },
  {
    name: 'Operator',
    description: 'Server and metrics management with limited user access',
    permissions: [
      'servers:create', 'servers:read', 'servers:update',
      'metrics:read', 'metrics:export',
      'users:read',
      'system:read',
      'ai:read', 'ai:analyze', 'ai:chat', 'ai:predict'
    ],
    isSystem: true
  },
  {
    name: 'Viewer',
    description: 'Read-only access to servers and metrics',
    permissions: [
      'servers:read',
      'metrics:read',
      'system:read',
      'ai:read'
    ],
    isSystem: true
  },
  {
    name: 'AI User',
    description: 'Specialized role for AI operations and analysis',
    permissions: [
      'servers:read',
      'metrics:read',
      'ai:read', 'ai:analyze', 'ai:chat', 'ai:predict',
      'system:read'
    ],
    isSystem: true
  }
];

export default {
  Permission,
  Role,
  UserRole,
  PermissionCategory,
  PermissionAction,
  SystemRole,
  AccessCheckResult,
  RBACContext,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES
};