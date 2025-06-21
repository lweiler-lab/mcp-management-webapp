import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import helmet from 'helmet';
import { AuthService, extractClientIP, extractUserAgent } from '@/utils/auth';
import { AuthenticationError, AuthorizationError, RateLimitError } from '@/types';
import Logger from '@/utils/logger';
import config from '@/config';

// Extend Express Request type to include auth data
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        permissions: string[];
        sessionId: string;
      };
      clientIP?: string;
      userAgent?: any;
      requestId?: string;
    }
  }
}

/**
 * Security Middleware Collection for MCP Management API
 * Implements enterprise-grade security with Cloudflare Zero Trust integration
 */

/**
 * Basic security headers middleware using Helmet
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for WebSocket
      connectSrc: ["'self'", "wss:", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

/**
 * Request context middleware - adds tracking and security context
 */
export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  // Generate unique request ID
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  // Extract client IP and user agent
  req.clientIP = extractClientIP(req);
  req.userAgent = extractUserAgent(req);
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);
  
  // Security headers for API responses
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Log request
  Logger.request(
    req.method,
    req.originalUrl,
    0, // Status will be updated in response middleware
    0, // Duration will be calculated
    {
      request_id: req.requestId,
      client_ip: req.clientIP,
      user_agent: req.userAgent.raw
    }
  );
  
  next();
};

/**
 * Rate limiting middleware with different limits for different endpoints
 */
class RateLimitManager {
  private authLimiter: RateLimiterMemory;
  private apiLimiter: RateLimiterMemory;
  private strictLimiter: RateLimiterMemory;

  constructor() {
    // Authentication endpoints - stricter limits
    this.authLimiter = new RateLimiterMemory({
      keyGenerator: (req: Request) => `auth_${req.clientIP}`,
      points: 5, // 5 attempts
      duration: 900, // per 15 minutes
      blockDuration: 900, // block for 15 minutes
    });

    // General API endpoints
    this.apiLimiter = new RateLimiterMemory({
      keyGenerator: (req: Request) => `api_${req.clientIP}`,
      points: config.security.rateLimiting.max,
      duration: config.security.rateLimiting.windowMs / 1000,
      blockDuration: 60, // block for 1 minute
    });

    // Admin/sensitive endpoints - very strict
    this.strictLimiter = new RateLimiterMemory({
      keyGenerator: (req: Request) => `strict_${req.clientIP}`,
      points: 10, // 10 attempts
      duration: 3600, // per hour
      blockDuration: 3600, // block for 1 hour
    });
  }

  auth() {
    return this.createMiddleware(this.authLimiter, 'authentication');
  }

  api() {
    return this.createMiddleware(this.apiLimiter, 'api');
  }

  strict() {
    return this.createMiddleware(this.strictLimiter, 'strict');
  }

  private createMiddleware(limiter: RateLimiterMemory, type: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await limiter.consume(req.clientIP || 'unknown');
        next();
      } catch (rateLimiterRes: any) {
        const remainingPoints = rateLimiterRes?.remainingPoints || 0;
        const msBeforeNext = rateLimiterRes?.msBeforeNext || 0;
        
        Logger.rateLimit(req.clientIP || 'unknown', req.originalUrl, {
          type,
          remaining_points: remainingPoints,
          retry_after: Math.round(msBeforeNext / 1000),
          request_id: req.requestId
        });

        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.round(msBeforeNext / 1000),
          requestId: req.requestId
        });
      }
    };
  }
}

export const rateLimiter = new RateLimitManager();

/**
 * JWT Authentication middleware
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = AuthService.extractToken(req.headers.authorization);
    
    if (!token) {
      Logger.auth('auth_failure', undefined, {
        reason: 'missing_token',
        client_ip: req.clientIP,
        request_id: req.requestId
      });
      throw new AuthenticationError('Authentication token required');
    }

    const decoded = await AuthService.verifyToken(token);
    
    // Add user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions,
      sessionId: decoded.sessionId
    };

    Logger.auth('token_verified', decoded.userId, {
      session_id: decoded.sessionId,
      client_ip: req.clientIP,
      request_id: req.requestId
    });

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        requestId: req.requestId
      });
    } else {
      Logger.error('Authentication middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId
      });
      res.status(500).json({
        success: false,
        error: 'Internal authentication error',
        requestId: req.requestId
      });
    }
  }
};

/**
 * Authorization middleware factory - checks permissions
 */
export const authorize = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      if (!AuthService.hasPermission(req.user.permissions, requiredPermission)) {
        Logger.security('Authorization failed', {
          user_id: req.user.id,
          required_permission: requiredPermission,
          user_permissions: req.user.permissions,
          client_ip: req.clientIP,
          request_id: req.requestId
        });
        throw new AuthorizationError(`Required permission: ${requiredPermission}`);
      }

      Logger.audit('Permission check passed', {
        user_id: req.user.id,
        permission: requiredPermission,
        resource: req.originalUrl,
        request_id: req.requestId
      });

      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          error: error.message,
          code: error.code,
          requestId: req.requestId
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          error: error.message,
          code: error.code,
          requestId: req.requestId
        });
      } else {
        Logger.error('Authorization middleware error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          request_id: req.requestId
        });
        res.status(500).json({
          success: false,
          error: 'Internal authorization error',
          requestId: req.requestId
        });
      }
    }
  };
};

/**
 * Role-based access control middleware
 */
export const requireRole = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const roleHierarchy = ['viewer', 'operator', 'admin'];
      const userRoleIndex = roleHierarchy.indexOf(req.user.role);
      const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
      
      if (userRoleIndex === -1 || userRoleIndex < requiredRoleIndex) {
        Logger.security('Role check failed', {
          user_id: req.user.id,
          user_role: req.user.role,
          required_role: requiredRole,
          client_ip: req.clientIP,
          request_id: req.requestId
        });
        throw new AuthorizationError(`Required role: ${requiredRole}`);
      }

      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          error: error.message,
          code: error.code,
          requestId: req.requestId
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          error: error.message,
          code: error.code,
          requestId: req.requestId
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal role check error',
          requestId: req.requestId
        });
      }
    }
  };
};

/**
 * Cloudflare Zero Trust integration middleware
 */
export const cloudflareAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Check for Cloudflare Access headers
    const cfAccessJwt = req.headers['cf-access-jwt-assertion'] as string;
    
    if (!cfAccessJwt && config.environment === 'production') {
      Logger.security('Missing Cloudflare Access JWT in production', {
        client_ip: req.clientIP,
        headers: Object.keys(req.headers),
        request_id: req.requestId
      });
      throw new AuthenticationError('Cloudflare Access required');
    }

    if (cfAccessJwt) {
      try {
        const accessData = await AuthService.validateCloudflareAccess(cfAccessJwt);
        
        // Add Cloudflare Access data to request
        req.cloudflareAccess = accessData;
        
        Logger.security('Cloudflare Access validated', {
          email: accessData.email,
          groups: accessData.groups,
          client_ip: req.clientIP,
          request_id: req.requestId
        });
      } catch (error) {
        Logger.security('Cloudflare Access validation failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          client_ip: req.clientIP,
          request_id: req.requestId
        });
        
        if (config.environment === 'production') {
          throw new AuthenticationError('Invalid Cloudflare Access token');
        }
        // In development, continue without Cloudflare Access
      }
    }

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        requestId: req.requestId
      });
    } else {
      Logger.error('Cloudflare Access middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId
      });
      res.status(500).json({
        success: false,
        error: 'Internal access control error',
        requestId: req.requestId
      });
    }
  }
};

/**
 * Input validation and sanitization middleware
 */
export const validateInput = (req: Request, res: Response, next: NextFunction): void => {
  // Basic input sanitization
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.trim().replace(/[<>]/g, ''); // Basic XSS prevention
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Audit logging middleware - logs all API actions
 */
export const auditLog = (req: Request, res: Response, next: NextFunction): void => {
  // Store original send function
  const originalSend = res.send;
  const startTime = Date.now();

  // Override send to capture response
  res.send = function(data: any) {
    const duration = Date.now() - startTime;
    
    // Log the completed request
    Logger.audit('API Request', {
      user_id: req.user?.id,
      method: req.method,
      url: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: duration,
      client_ip: req.clientIP,
      user_agent: req.userAgent?.raw,
      request_id: req.requestId,
      body_size: req.headers['content-length'] || 0,
      response_size: Buffer.byteLength(data || ''),
      query_params: Object.keys(req.query || {}).length > 0 ? req.query : undefined
    });

    // Call original send
    return originalSend.call(this, data);
  };

  next();
};

/**
 * Error handling middleware for security-related errors
 */
export const securityErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof AuthenticationError) {
    Logger.security('Authentication error', {
      error: error.message,
      user_id: req.user?.id,
      client_ip: req.clientIP,
      request_id: req.requestId
    });
    res.status(401).json({
      success: false,
      error: error.message,
      code: error.code,
      requestId: req.requestId
    });
  } else if (error instanceof AuthorizationError) {
    Logger.security('Authorization error', {
      error: error.message,
      user_id: req.user?.id,
      client_ip: req.clientIP,
      request_id: req.requestId
    });
    res.status(403).json({
      success: false,
      error: error.message,
      code: error.code,
      requestId: req.requestId
    });
  } else if (error instanceof RateLimitError) {
    Logger.security('Rate limit error', {
      error: error.message,
      client_ip: req.clientIP,
      request_id: req.requestId
    });
    res.status(429).json({
      success: false,
      error: error.message,
      code: error.code,
      requestId: req.requestId
    });
  } else {
    // Pass to next error handler
    next(error);
  }
};

/**
 * CORS configuration with security considerations
 */
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (config.security.cors.origin.includes(origin)) {
      return callback(null, true);
    } else {
      Logger.security('CORS origin blocked', { 
        origin,
        allowed_origins: config.security.cors.origin
      });
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: config.security.cors.credentials,
  maxAge: config.security.cors.maxAge,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
    'CF-Access-JWT-Assertion'
  ],
  exposedHeaders: ['X-Request-ID']
};

// Export all middleware
export default {
  securityHeaders,
  requestContext,
  rateLimiter,
  authenticate,
  authorize,
  requireRole,
  cloudflareAccess,
  validateInput,
  auditLog,
  securityErrorHandler,
  corsConfig
};