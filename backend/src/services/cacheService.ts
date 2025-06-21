import Redis from 'ioredis';
import Logger from '@/utils/logger';
import config from '@/config';

/**
 * Cache Service
 * 
 * Redis-based caching service for performance optimization
 * Provides intelligent caching with TTL, invalidation, and monitoring
 */
export class CacheService {
  private static instance: CacheService;
  private redis: Redis | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    try {
      // Use in-memory cache if Redis not available
      if (!config.redis?.enabled) {
        Logger.info('Redis disabled, using in-memory cache');
        return;
      }

      this.redis = new Redis({
        host: config.redis.host || 'localhost',
        port: config.redis.port || 6379,
        password: config.redis.password,
        db: config.redis.db || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      await this.redis.connect();
      this.isConnected = true;

      this.redis.on('error', (error) => {
        Logger.error('Redis connection error', {
          error: error.message
        });
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        Logger.info('Redis connected successfully');
        this.isConnected = true;
      });

      Logger.info('Cache service initialized with Redis');

    } catch (error) {
      Logger.warn('Failed to connect to Redis, falling back to in-memory cache', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.redis = null;
      this.isConnected = false;
    }
  }

  /**
   * Get cached value
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (this.redis && this.isConnected) {
        const value = await this.redis.get(this.formatKey(key));
        return value ? JSON.parse(value) : null;
      }
      
      // Fallback to in-memory cache
      return this.memoryCache.get(key) || null;

    } catch (error) {
      Logger.error('Cache get error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Set cached value with TTL
   */
  async set(key: string, value: any, ttlSeconds = 300): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);

      if (this.redis && this.isConnected) {
        await this.redis.setex(this.formatKey(key), ttlSeconds, serialized);
        return true;
      }

      // Fallback to in-memory cache
      this.memoryCache.set(key, value);
      if (ttlSeconds > 0) {
        setTimeout(() => {
          this.memoryCache.delete(key);
        }, ttlSeconds * 1000);
      }
      return true;

    } catch (error) {
      Logger.error('Cache set error', {
        key,
        ttl: ttlSeconds,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<boolean> {
    try {
      if (this.redis && this.isConnected) {
        await this.redis.del(this.formatKey(key));
        return true;
      }

      // Fallback to in-memory cache
      this.memoryCache.delete(key);
      return true;

    } catch (error) {
      Logger.error('Cache delete error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      if (this.redis && this.isConnected) {
        const keys = await this.redis.keys(this.formatKey(pattern));
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        return keys.length;
      }

      // Fallback to in-memory cache
      let deleted = 0;
      const regex = new RegExp(pattern.replace('*', '.*'));
      for (const key of this.memoryCache.keys()) {
        if (regex.test(key)) {
          this.memoryCache.delete(key);
          deleted++;
        }
      }
      return deleted;

    } catch (error) {
      Logger.error('Cache delete pattern error', {
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (this.redis && this.isConnected) {
        const result = await this.redis.exists(this.formatKey(key));
        return result === 1;
      }

      // Fallback to in-memory cache
      return this.memoryCache.has(key);

    } catch (error) {
      Logger.error('Cache exists error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get and cache with fallback function
   */
  async getOrSet<T>(
    key: string,
    fallbackFn: () => Promise<T>,
    ttlSeconds = 300
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      const value = await fallbackFn();
      await this.set(key, value, ttlSeconds);
      return value;

    } catch (error) {
      Logger.error('Cache getOrSet error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // If cache fails, still return the fallback value
      return await fallbackFn();
    }
  }

  /**
   * Increment counter
   */
  async increment(key: string, amount = 1, ttlSeconds = 3600): Promise<number> {
    try {
      if (this.redis && this.isConnected) {
        const result = await this.redis.incrby(this.formatKey(key), amount);
        await this.redis.expire(this.formatKey(key), ttlSeconds);
        return result;
      }

      // Fallback to in-memory cache
      const current = this.memoryCache.get(key) || 0;
      const newValue = current + amount;
      this.memoryCache.set(key, newValue);
      
      if (ttlSeconds > 0) {
        setTimeout(() => {
          this.memoryCache.delete(key);
        }, ttlSeconds * 1000);
      }
      
      return newValue;

    } catch (error) {
      Logger.error('Cache increment error', {
        key,
        amount,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return amount;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    memoryUsage?: number;
    connections?: number;
    operations?: number;
    hitRate?: number;
  }> {
    try {
      if (this.redis && this.isConnected) {
        const info = await this.redis.info('memory');
        const memoryMatch = info.match(/used_memory:(\d+)/);
        const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;

        return {
          connected: true,
          memoryUsage,
          connections: 1, // Single connection
          operations: await this.redis.dbsize()
        };
      }

      return {
        connected: false,
        memoryUsage: this.getMemoryCacheSize(),
        operations: this.memoryCache.size
      };

    } catch (error) {
      Logger.error('Cache stats error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { connected: false };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (this.redis && this.isConnected) {
        await this.redis.ping();
        return true;
      }
      return true; // In-memory cache is always "healthy"
    } catch (error) {
      return false;
    }
  }

  /**
   * Shutdown cache service
   */
  async shutdown(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.quit();
        this.redis = null;
        this.isConnected = false;
      }
      this.memoryCache.clear();
      Logger.info('Cache service shutdown completed');
    } catch (error) {
      Logger.error('Cache shutdown error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Cache key helpers
  private formatKey(key: string): string {
    const prefix = config.redis?.keyPrefix || 'mcp:';
    return `${prefix}${key}`;
  }

  // In-memory cache fallback
  private memoryCache = new Map<string, any>();

  private getMemoryCacheSize(): number {
    let size = 0;
    for (const [key, value] of this.memoryCache.entries()) {
      size += key.length + JSON.stringify(value).length;
    }
    return size;
  }
}

// Cache key constants
export const CacheKeys = {
  SERVER_LIST: 'servers:list',
  SERVER_DETAIL: (id: string) => `servers:${id}`,
  SERVER_METRICS: (id: string) => `servers:${id}:metrics`,
  METRICS_SUMMARY: 'metrics:summary',
  SYSTEM_HEALTH: 'system:health',
  USER_PERMISSIONS: (userId: string) => `users:${userId}:permissions`,
  USER_ROLES: (userId: string) => `users:${userId}:roles`,
  AI_ANALYSIS: (serverId: string) => `ai:analysis:${serverId}`,
  AUDIT_STATS: 'audit:stats',
  MCP_BRIDGE_STATUS: 'bridge:status'
} as const;

// Cache TTL constants (in seconds)
export const CacheTTL = {
  SHORT: 60,      // 1 minute
  MEDIUM: 300,    // 5 minutes
  LONG: 1800,     // 30 minutes
  VERY_LONG: 3600 // 1 hour
} as const;

export default CacheService;