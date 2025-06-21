import { Request, Response, NextFunction } from 'express';
import RBACService from '@/services/rbacService';
import Logger from '@/utils/logger';

/**
 * RBAC Middleware for Express Routes
 * 
 * Provides role-based access control for API endpoints
 * with granular permission checking
 */

// Extend Request type to include RBAC context
declare global {
  namespace Express {
    interface Request {
      rbac?: {
        userId: string;
        permissions: string[];
        roles: string[];
        accessGranted: boolean;
      };
    }
  }
}

/**
 * Middleware factory to require specific permissions
 */
export function requirePermissions(requiredPermissions: string | string[]) {
  const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is authenticated
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be logged in to access this resource',
          requestId: req.requestId
        });
        return;
      }

      const rbacService = RBACService.getInstance();
      
      // Perform access check
      const accessResult = await rbacService.checkAccess(
        req.user.id,
        permissions,
        {
          userId: req.user.id,
          clientIP: req.clientIP,
          userAgent: req.get('User-Agent') || 'unknown',
          sessionId: req.sessionID || 'unknown'
        } as any
      );

      // Store RBAC context in request
      req.rbac = {
        userId: req.user.id,
        permissions: accessResult.userPermissions,
        roles: [], // Will be populated if needed
        accessGranted: accessResult.allowed
      };

      if (!accessResult.allowed) {
        Logger.security('Access denied - insufficient permissions', {
          user_id: req.user.id,
          required_permissions: permissions,
          user_permissions: accessResult.userPermissions,
          missing_permissions: accessResult.missingPermissions,
          endpoint: req.originalUrl,
          method: req.method,
          client_ip: req.clientIP,
          user_agent: req.get('User-Agent')
        });

        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: accessResult.reason || 'You do not have permission to access this resource',
          required_permissions: accessResult.requiredPermissions,
          missing_permissions: accessResult.missingPermissions,
          requestId: req.requestId
        });
        return;
      }

      // Log successful access
      Logger.security('Access granted', {
        user_id: req.user.id,
        required_permissions: permissions,
        endpoint: req.originalUrl,
        method: req.method,
        client_ip: req.clientIP
      });

      next();

    } catch (error) {
      Logger.error('RBAC middleware error', {
        user_id: req.user?.id,
        required_permissions: permissions,
        endpoint: req.originalUrl,
        method: req.method,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        message: 'Unable to verify permissions at this time',
        requestId: req.requestId
      });
    }
  };
}

/**
 * Middleware to require specific roles
 */
export function requireRoles(requiredRoles: string | string[]) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          requestId: req.requestId
        });
        return;
      }

      const rbacService = RBACService.getInstance();
      const userRoles = await rbacService.getUserRoles(req.user.id);
      const activeRoleNames = userRoles
        .filter(role => role.isSystem || true) // Add additional active checks if needed
        .map(role => role.name);

      const hasRequiredRole = roles.some(role => activeRoleNames.includes(role));

      if (!hasRequiredRole) {
        Logger.security('Access denied - insufficient roles', {
          user_id: req.user.id,
          required_roles: roles,
          user_roles: activeRoleNames,
          endpoint: req.originalUrl,
          method: req.method,
          client_ip: req.clientIP
        });

        res.status(403).json({
          success: false,
          error: 'Insufficient role permissions',
          message: 'Your current role does not allow access to this resource',
          required_roles: roles,
          requestId: req.requestId
        });
        return;
      }

      // Store role context
      if (req.rbac) {
        req.rbac.roles = activeRoleNames;
      }

      Logger.security('Role-based access granted', {
        user_id: req.user.id,
        required_roles: roles,
        user_roles: activeRoleNames,
        endpoint: req.originalUrl,
        method: req.method
      });

      next();

    } catch (error) {
      Logger.error('Role-based access check failed', {
        user_id: req.user?.id,
        required_roles: roles,
        endpoint: req.originalUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Role authorization check failed',
        requestId: req.requestId
      });
    }
  };
}

/**
 * Middleware for super admin access only
 */
export const requireSuperAdmin = requirePermissions(['admin:full_access']);

/**
 * Middleware for admin access (admin or super admin)
 */
export const requireAdmin = requireRoles(['Administrator', 'Super Administrator']);

/**
 * Middleware for operator level access
 */
export const requireOperator = requireRoles(['Operator', 'Administrator', 'Super Administrator']);

/**
 * Middleware for basic authenticated access (any valid user)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.id) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'You must be logged in to access this resource',
      requestId: req.requestId
    });
    return;
  }
  next();
}

/**
 * Conditional permission middleware - only checks if user is authenticated
 */
export function optionalPermissions(requiredPermissions: string | string[]) {
  const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.id) {
      // No user, skip permission check
      next();
      return;
    }

    try {
      const rbacService = RBACService.getInstance();
      const accessResult = await rbacService.checkAccess(req.user.id, permissions);
      
      req.rbac = {
        userId: req.user.id,
        permissions: accessResult.userPermissions,
        roles: [],
        accessGranted: accessResult.allowed
      };

      // Continue regardless of access result
      next();

    } catch (error) {
      Logger.warn('Optional permission check failed', {
        user_id: req.user.id,
        permissions,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Continue with limited context
      req.rbac = {
        userId: req.user.id,
        permissions: [],
        roles: [],
        accessGranted: false
      };
      
      next();
    }
  };
}

export default {
  requirePermissions,
  requireRoles,
  requireSuperAdmin,
  requireAdmin,
  requireOperator,
  requireAuth,
  optionalPermissions
};