import { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import CacheService, { CacheKeys, CacheTTL } from '@/services/cacheService';
import Logger from '@/utils/logger';

/**
 * Performance Middleware
 * 
 * Optimizes API performance through caching, compression, and monitoring
 */

// Response caching middleware
export const cacheMiddleware = (
  keyGenerator: (req: Request) => string,
  ttl: number = CacheTTL.MEDIUM,
  condition?: (req: Request) => boolean
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition if provided
    if (condition && !condition(req)) {
      return next();
    }

    const cacheKey = keyGenerator(req);
    const cacheService = CacheService.getInstance();

    try {
      // Try to get cached response
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        // Add cache headers
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);
        
        Logger.api('Cache hit', req.user?.id, {
          cache_key: cacheKey,
          endpoint: req.originalUrl
        });

        return res.json(cached);
      }

      // Cache miss - continue to handler and cache response
      res.set('X-Cache', 'MISS');
      res.set('X-Cache-Key', cacheKey);

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function(data: any) {
        // Only cache successful responses
        if (res.statusCode === 200 && data?.success) {
          cacheService.set(cacheKey, data, ttl).catch(error => {
            Logger.warn('Failed to cache response', {
              cache_key: cacheKey,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          });
        }
        return originalJson(data);
      };

      next();

    } catch (error) {
      Logger.warn('Cache middleware error', {
        cache_key: cacheKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next();
    }
  };
};

// Cache invalidation middleware
export const invalidateCache = (patterns: string | string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original res.end to trigger cache invalidation after response
    const originalEnd = res.end.bind(res);
    
    res.end = function(...args: any[]) {
      // Only invalidate on successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cacheService = CacheService.getInstance();
        const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
        
        Promise.all(
          patternsArray.map(pattern => cacheService.deletePattern(pattern))
        ).then(results => {
          const totalDeleted = results.reduce((sum, count) => sum + count, 0);
          if (totalDeleted > 0) {
            Logger.api('Cache invalidated', req.user?.id, {
              patterns: patternsArray,
              deleted_keys: totalDeleted,
              endpoint: req.originalUrl,
              method: req.method
            });
          }
        }).catch(error => {
          Logger.warn('Cache invalidation error', {
            patterns: patternsArray,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        });
      }
      
      return originalEnd(...args);
    };

    next();
  };
};

// Request timing middleware
export const requestTiming = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Add timing header
    res.set('X-Response-Time', `${duration}ms`);
    
    // Log slow requests
    if (duration > 1000) {
      Logger.warn('Slow request detected', {
        duration,
        method: req.method,
        url: req.originalUrl,
        status_code: res.statusCode,
        user_id: req.user?.id
      });
    }
    
    // Track performance metrics
    Logger.api('Request completed', req.user?.id, {
      duration,
      method: req.method,
      url: req.originalUrl,
      status_code: res.statusCode,
      client_ip: req.clientIP
    });
  });

  next();
};

// Memory usage monitoring
export const memoryMonitoring = (req: Request, res: Response, next: NextFunction) => {
  const memUsage = process.memoryUsage();
  
  // Log memory warnings
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  if (heapUsedMB > 500) { // Warning at 500MB
    Logger.warn('High memory usage detected', {
      heap_used_mb: Math.round(heapUsedMB),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      external_mb: Math.round(memUsage.external / 1024 / 1024),
      endpoint: req.originalUrl
    });
  }

  next();
};

// Compression middleware with custom settings
export const compressionMiddleware = compression({
  filter: (req: Request, res: Response) => {
    // Don't compress if the client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    
    // Use compression for JSON responses
    return compression.filter(req, res);
  },
  level: 6, // Balance between compression ratio and speed
  threshold: 1024, // Only compress responses > 1KB
});

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Rate limiting with cache-based counters
export const enhancedRateLimit = (
  windowMs: number,
  maxRequests: number,
  keyGenerator?: (req: Request) => string
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator ? keyGenerator(req) : req.clientIP;
    const cacheKey = `ratelimit:${key}`;
    const cacheService = CacheService.getInstance();

    try {
      const current = await cacheService.increment(cacheKey, 1, Math.ceil(windowMs / 1000));
      
      // Add rate limit headers
      res.set('X-RateLimit-Limit', maxRequests.toString());
      res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - current).toString());
      res.set('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());

      if (current > maxRequests) {
        Logger.security('Rate limit exceeded', {
          key,
          current_requests: current,
          max_requests: maxRequests,
          endpoint: req.originalUrl,
          client_ip: req.clientIP,
          user_id: req.user?.id
        });

        res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(windowMs / 1000)
        });
        return;
      }

      next();

    } catch (error) {
      Logger.error('Rate limiting error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Continue on error
      next();
    }
  };
};

// Health check optimization
export const healthCheckCache = cacheMiddleware(
  () => 'health:status',
  30, // 30 seconds TTL
  (req) => req.path.includes('/health')
);

// Server list caching
export const serverListCache = cacheMiddleware(
  (req) => {
    const query = new URLSearchParams(req.query as any).toString();
    return `${CacheKeys.SERVER_LIST}:${query}`;
  },
  CacheTTL.MEDIUM
);

// Metrics caching
export const metricsCache = cacheMiddleware(
  (req) => {
    if (req.params.id) {
      return CacheKeys.SERVER_METRICS(req.params.id);
    }
    return CacheKeys.METRICS_SUMMARY;
  },
  CacheTTL.SHORT
);

// Cache invalidation patterns
export const invalidateServerCache = invalidateCache([
  'servers:*',
  'metrics:*',
  'system:*'
]);

export const invalidateUserCache = invalidateCache([
  'users:*'
]);

export const invalidateSystemCache = invalidateCache([
  'system:*',
  'health:*'
]);

export default {
  cacheMiddleware,
  invalidateCache,
  requestTiming,
  memoryMonitoring,
  compressionMiddleware,
  securityHeaders,
  enhancedRateLimit,
  healthCheckCache,
  serverListCache,
  metricsCache,
  invalidateServerCache,
  invalidateUserCache,
  invalidateSystemCache
};