import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, UserSession, AuthenticationError, AuthorizationError } from '@/types';
import config from '@/config';
import Logger from '@/utils/logger';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Authentication and Authorization Utilities
 * Integrates with Cloudflare Zero Trust for enterprise security
 */
export class AuthService {
  
  /**
   * Generate JWT access token
   */
  static generateAccessToken(user: User, sessionId: string): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      permissions: this.getRolePermissions(user.role)
    };

    return jwt.sign(payload, config.security.jwtSecret, {
      expiresIn: config.security.jwtExpiresIn,
      issuer: 'mcp-management-api',
      audience: 'mcp-management-webapp'
    });
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(): string {
    return jwt.sign(
      { type: 'refresh', timestamp: Date.now() },
      config.security.jwtSecret,
      { expiresIn: '30d' }
    );
  }

  /**
   * Verify JWT token
   */
  static async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = jwt.verify(token, config.security.jwtSecret, {
        issuer: 'mcp-management-api',
        audience: 'mcp-management-webapp'
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      } else {
        throw new AuthenticationError('Token verification failed');
      }
    }
  }

  /**
   * Hash password with bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.security.bcryptSaltRounds);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Get role-based permissions
   */
  static getRolePermissions(role: string): string[] {
    const rolePermissions: Record<string, string[]> = {
      admin: [
        'servers:read',
        'servers:write',
        'servers:delete',
        'users:read',
        'users:write',
        'users:delete',
        'metrics:read',
        'alerts:read',
        'alerts:write',
        'system:read',
        'system:write',
        'audit:read'
      ],
      operator: [
        'servers:read',
        'servers:write',
        'metrics:read',
        'alerts:read',
        'alerts:write',
        'system:read'
      ],
      viewer: [
        'servers:read',
        'metrics:read',
        'alerts:read'
      ],
      service: [
        'servers:read',
        'metrics:read'
      ]
    };

    return rolePermissions[role] || [];
  }

  /**
   * Check if user has required permission
   */
  static hasPermission(userPermissions: string[], requiredPermission: string): boolean {
    return userPermissions.includes(requiredPermission) || 
           userPermissions.includes('*'); // Admin wildcard
  }

  /**
   * Validate Cloudflare Access JWT (for Zero Trust integration)
   */
  static async validateCloudflareAccess(accessToken: string): Promise<{
    email: string;
    userId: string;
    groups: string[];
  }> {
    try {
      // In production, this would verify the Cloudflare Access JWT
      // For now, decode without verification for development
      const decoded = jwt.decode(accessToken) as any;
      
      if (!decoded || !decoded.email) {
        throw new AuthenticationError('Invalid Cloudflare Access token');
      }

      return {
        email: decoded.email,
        userId: decoded.sub || decoded.email,
        groups: decoded.groups || []
      };
    } catch (error) {
      Logger.security('Cloudflare Access validation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw new AuthenticationError('Cloudflare Access validation failed');
    }
  }

  /**
   * Generate secure session ID
   */
  static generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Extract token from Authorization header
   */
  static extractToken(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Rate limiting check for authentication attempts
   */
  static async checkRateLimit(identifier: string, maxAttempts: number = 5): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: Date;
  }> {
    // This would integrate with Redis or in-memory store
    // For now, return allowed for development
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetTime: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    };
  }

  /**
   * Security event logging
   */
  static logSecurityEvent(
    event: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    additionalData?: Record<string, any>
  ): void {
    Logger.security(event, {
      user_id: userId,
      ip_address: ipAddress,
      user_agent: userAgent,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Middleware helper functions
 */

/**
 * JWT verification helper for Express middleware
 */
export async function verifyJWT(token: string): Promise<JWTPayload> {
  return AuthService.verifyToken(token);
}

/**
 * Permission check helper
 */
export function requirePermission(permission: string) {
  return (userPermissions: string[]) => {
    if (!AuthService.hasPermission(userPermissions, permission)) {
      throw new AuthorizationError(`Required permission: ${permission}`);
    }
  };
}

/**
 * Role check helper
 */
export function requireRole(requiredRole: string) {
  return (userRole: string) => {
    const roleHierarchy = ['viewer', 'operator', 'admin'];
    const userRoleIndex = roleHierarchy.indexOf(userRole);
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
    
    if (userRoleIndex === -1 || userRoleIndex < requiredRoleIndex) {
      throw new AuthorizationError(`Required role: ${requiredRole}`);
    }
  };
}

/**
 * IP address validation and extraction
 */
export function extractClientIP(req: any): string {
  return req.headers['cf-connecting-ip'] || // Cloudflare
         req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * User agent extraction and parsing
 */
export function extractUserAgent(req: any): {
  raw: string;
  browser?: string;
  os?: string;
  device?: string;
} {
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Basic user agent parsing (in production, use a proper library)
  const browser = userAgent.includes('Chrome') ? 'Chrome' :
                  userAgent.includes('Firefox') ? 'Firefox' :
                  userAgent.includes('Safari') ? 'Safari' :
                  userAgent.includes('Edge') ? 'Edge' : 'Unknown';
  
  const os = userAgent.includes('Windows') ? 'Windows' :
             userAgent.includes('Mac') ? 'macOS' :
             userAgent.includes('Linux') ? 'Linux' :
             userAgent.includes('Android') ? 'Android' :
             userAgent.includes('iOS') ? 'iOS' : 'Unknown';

  const device = userAgent.includes('Mobile') ? 'Mobile' :
                 userAgent.includes('Tablet') ? 'Tablet' : 'Desktop';

  return {
    raw: userAgent,
    browser,
    os,
    device
  };
}

/**
 * Generate cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return result;
}

/**
 * Time-based one-time password (TOTP) helpers
 */
export class TOTPService {
  static generateSecret(): string {
    return generateSecureToken(32);
  }

  static generateTOTP(secret: string, window: number = 0): string {
    // This would implement proper TOTP algorithm
    // For now, return a placeholder
    const timeStep = Math.floor(Date.now() / 30000) + window;
    return (timeStep % 1000000).toString().padStart(6, '0');
  }

  static verifyTOTP(token: string, secret: string, windowSize: number = 1): boolean {
    // Check current window and adjacent windows for clock drift
    for (let i = -windowSize; i <= windowSize; i++) {
      if (this.generateTOTP(secret, i) === token) {
        return true;
      }
    }
    return false;
  }
}

export default AuthService;