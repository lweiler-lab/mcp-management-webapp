import { db } from '@/database/connection';
import Logger from '@/utils/logger';
import {
  Permission,
  Role,
  UserRole,
  RBACContext,
  AccessCheckResult,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  SystemRole
} from '@/types/rbac';

/**
 * Role-Based Access Control Service
 * 
 * Manages permissions, roles, and access control for the MCP Management system
 * Provides enterprise-grade security with granular permission management
 */
export class RBACService {
  private static instance: RBACService;

  private constructor() {}

  public static getInstance(): RBACService {
    if (!RBACService.instance) {
      RBACService.instance = new RBACService();
    }
    return RBACService.instance;
  }

  /**
   * Initialize RBAC system with default permissions and roles
   */
  async initialize(): Promise<void> {
    try {
      Logger.info('Initializing RBAC system...');

      // Create permissions table if not exists
      await this.createPermissionsTable();
      
      // Create roles table if not exists
      await this.createRolesTable();
      
      // Create user_roles table if not exists
      await this.createUserRolesTable();

      // Insert default permissions
      await this.insertDefaultPermissions();
      
      // Insert default roles
      await this.insertDefaultRoles();

      Logger.info('RBAC system initialized successfully');

    } catch (error) {
      Logger.error('Failed to initialize RBAC system', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check if user has required permissions for an action
   */
  async checkAccess(
    userId: string,
    requiredPermissions: string[],
    context?: Partial<RBACContext>
  ): Promise<AccessCheckResult> {
    try {
      // Get user permissions
      const userPermissions = await this.getUserPermissions(userId);
      
      // Check for super admin access
      if (userPermissions.includes('admin:full_access')) {
        return {
          allowed: true,
          requiredPermissions,
          userPermissions,
          missingPermissions: []
        };
      }

      // Check specific permissions
      const missingPermissions = requiredPermissions.filter(
        perm => !userPermissions.includes(perm)
      );

      const allowed = missingPermissions.length === 0;

      const result: AccessCheckResult = {
        allowed,
        requiredPermissions,
        userPermissions,
        missingPermissions
      };

      if (!allowed) {
        result.reason = `Missing permissions: ${missingPermissions.join(', ')}`;
      }

      // Log access check
      Logger.security('Access check performed', {
        user_id: userId,
        required_permissions: requiredPermissions,
        user_permissions: userPermissions.length,
        access_granted: allowed,
        missing_permissions: missingPermissions,
        client_ip: context?.clientIP,
        user_agent: context?.userAgent
      });

      return result;

    } catch (error) {
      Logger.error('Access check failed', {
        user_id: userId,
        required_permissions: requiredPermissions,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        allowed: false,
        reason: 'Access check failed',
        requiredPermissions,
        userPermissions: [],
        missingPermissions: requiredPermissions
      };
    }
  }

  /**
   * Get all permissions for a user (from all assigned roles)
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const query = `
        SELECT DISTINCT p.name
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = $1 
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      `;

      const result = await db.query(query, [userId]);
      return result.rows.map(row => row.name);

    } catch (error) {
      Logger.error('Failed to get user permissions', {
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Get all roles for a user
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    try {
      const query = `
        SELECT r.*, ur.assigned_at, ur.expires_at, ur.is_active
        FROM roles r
        JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = $1
        ORDER BY ur.assigned_at DESC
      `;

      const result = await db.query(query, [userId]);
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        permissions: row.permissions || [],
        isSystem: row.is_system,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by
      }));

    } catch (error) {
      Logger.error('Failed to get user roles', {
        user_id: userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(
    userId: string,
    roleId: string,
    assignedBy: string,
    expiresAt?: Date
  ): Promise<boolean> {
    try {
      // Check if role exists
      const roleExists = await this.roleExists(roleId);
      if (!roleExists) {
        throw new Error('Role not found');
      }

      // Check if user already has this role
      const existingAssignment = await this.getUserRoleAssignment(userId, roleId);
      if (existingAssignment && existingAssignment.isActive) {
        Logger.warn('User already has this role assigned', {
          user_id: userId,
          role_id: roleId,
          assigned_by: assignedBy
        });
        return true;
      }

      // Deactivate existing assignment if any
      if (existingAssignment) {
        await this.deactivateUserRole(existingAssignment.id);
      }

      // Create new assignment
      const query = `
        INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, expires_at, is_active)
        VALUES ($1, $2, $3, NOW(), $4, true)
        RETURNING id
      `;

      const result = await db.query(query, [userId, roleId, assignedBy, expiresAt]);

      Logger.audit('Role assigned to user', {
        user_id: userId,
        role_id: roleId,
        assigned_by: assignedBy,
        expires_at: expiresAt?.toISOString(),
        assignment_id: result.rows[0].id
      });

      return true;

    } catch (error) {
      Logger.error('Failed to assign role', {
        user_id: userId,
        role_id: roleId,
        assigned_by: assignedBy,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleId: string, removedBy: string): Promise<boolean> {
    try {
      const assignment = await this.getUserRoleAssignment(userId, roleId);
      if (!assignment || !assignment.isActive) {
        Logger.warn('No active role assignment found', {
          user_id: userId,
          role_id: roleId,
          removed_by: removedBy
        });
        return true;
      }

      await this.deactivateUserRole(assignment.id);

      Logger.audit('Role removed from user', {
        user_id: userId,
        role_id: roleId,
        removed_by: removedBy,
        assignment_id: assignment.id
      });

      return true;

    } catch (error) {
      Logger.error('Failed to remove role', {
        user_id: userId,
        role_id: roleId,
        removed_by: removedBy,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Create custom role
   */
  async createRole(
    name: string,
    description: string,
    permissions: string[],
    createdBy: string
  ): Promise<string | null> {
    try {
      // Validate permissions exist
      const validPermissions = await this.validatePermissions(permissions);
      if (validPermissions.length !== permissions.length) {
        throw new Error('Some permissions do not exist');
      }

      // Create role
      const roleQuery = `
        INSERT INTO roles (name, description, is_system, created_by, created_at, updated_at)
        VALUES ($1, $2, false, $3, NOW(), NOW())
        RETURNING id
      `;

      const roleResult = await db.query(roleQuery, [name, description, createdBy]);
      const roleId = roleResult.rows[0].id;

      // Assign permissions to role
      if (permissions.length > 0) {
        const permissionQuery = `
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT $1, id FROM permissions WHERE name = ANY($2)
        `;
        await db.query(permissionQuery, [roleId, permissions]);
      }

      Logger.audit('Custom role created', {
        role_id: roleId,
        role_name: name,
        permissions_count: permissions.length,
        created_by: createdBy
      });

      return roleId;

    } catch (error) {
      Logger.error('Failed to create role', {
        role_name: name,
        permissions_count: permissions.length,
        created_by: createdBy,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Get all available permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    try {
      const query = `
        SELECT id, name, resource, action, description, category, created_at
        FROM permissions
        ORDER BY category, name
      `;

      const result = await db.query(query);
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        resource: row.resource,
        action: row.action,
        description: row.description,
        category: row.category,
        createdAt: row.created_at
      }));

    } catch (error) {
      Logger.error('Failed to get permissions', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Get all available roles
   */
  async getAllRoles(): Promise<Role[]> {
    try {
      const query = `
        SELECT r.*, 
               COALESCE(
                 JSON_AGG(p.name) FILTER (WHERE p.name IS NOT NULL), 
                 '[]'::json
               ) as permissions
        FROM roles r
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        GROUP BY r.id, r.name, r.description, r.is_system, r.created_by, r.created_at, r.updated_at
        ORDER BY r.is_system DESC, r.name
      `;

      const result = await db.query(query);
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        permissions: row.permissions || [],
        isSystem: row.is_system,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by
      }));

    } catch (error) {
      Logger.error('Failed to get roles', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  // Private helper methods

  private async createPermissionsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        resource VARCHAR(100) NOT NULL,
        action VARCHAR(50) NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
      CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
    `;
    await db.query(query);
  }

  private async createRolesTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        is_system BOOLEAN DEFAULT false,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
        permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(role_id, permission_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
      CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
    `;
    await db.query(query);
  }

  private async createUserRolesTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
        assigned_by UUID REFERENCES users(id),
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);
    `;
    await db.query(query);
  }

  private async insertDefaultPermissions(): Promise<void> {
    try {
      for (const permission of SYSTEM_PERMISSIONS) {
        const query = `
          INSERT INTO permissions (name, resource, action, description, category)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (name) DO NOTHING
        `;
        await db.query(query, [
          permission.name,
          permission.resource,
          permission.action,
          permission.description,
          permission.category
        ]);
      }
      Logger.info(`Inserted ${SYSTEM_PERMISSIONS.length} default permissions`);
    } catch (error) {
      Logger.error('Failed to insert default permissions', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async insertDefaultRoles(): Promise<void> {
    try {
      for (const role of SYSTEM_ROLES) {
        // Insert role
        const roleQuery = `
          INSERT INTO roles (name, description, is_system, created_at, updated_at)
          VALUES ($1, $2, $3, NOW(), NOW())
          ON CONFLICT (name) DO UPDATE SET
            description = EXCLUDED.description,
            updated_at = NOW()
          RETURNING id
        `;
        const roleResult = await db.query(roleQuery, [role.name, role.description, role.isSystem]);
        const roleId = roleResult.rows[0].id;

        // Clear existing permissions
        await db.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

        // Insert role permissions
        if (role.permissions.length > 0) {
          const permissionQuery = `
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT $1, p.id FROM permissions p WHERE p.name = ANY($2)
          `;
          await db.query(permissionQuery, [roleId, role.permissions]);
        }
      }
      Logger.info(`Inserted ${SYSTEM_ROLES.length} default roles`);
    } catch (error) {
      Logger.error('Failed to insert default roles', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async roleExists(roleId: string): Promise<boolean> {
    const query = 'SELECT 1 FROM roles WHERE id = $1';
    const result = await db.query(query, [roleId]);
    return result.rows.length > 0;
  }

  private async getUserRoleAssignment(userId: string, roleId: string): Promise<UserRole | null> {
    const query = `
      SELECT id, user_id, role_id, assigned_by, assigned_at, expires_at, is_active
      FROM user_roles
      WHERE user_id = $1 AND role_id = $2
      ORDER BY assigned_at DESC
      LIMIT 1
    `;
    const result = await db.query(query, [userId, roleId]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      roleId: row.role_id,
      assignedBy: row.assigned_by,
      assignedAt: row.assigned_at,
      expiresAt: row.expires_at,
      isActive: row.is_active
    };
  }

  private async deactivateUserRole(assignmentId: string): Promise<void> {
    const query = 'UPDATE user_roles SET is_active = false WHERE id = $1';
    await db.query(query, [assignmentId]);
  }

  private async validatePermissions(permissions: string[]): Promise<string[]> {
    if (permissions.length === 0) return [];
    
    const query = 'SELECT name FROM permissions WHERE name = ANY($1)';
    const result = await db.query(query, [permissions]);
    return result.rows.map(row => row.name);
  }
}

export default RBACService;