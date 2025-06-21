import { Router, Request, Response } from 'express';
import { authenticate, authorize, rateLimiter } from '@/middleware/security';
import { db } from '@/database/connection';
import { getMCPBridgeClient } from '@/services/mcpBridgeClient';
import Logger from '@/utils/logger';
import config from '@/config';

/**
 * System Information and Configuration Routes
 */
const router = Router();

// Apply authentication to all system routes
router.use(authenticate);

/**
 * GET /api/v1/system/info
 * Get system information
 * Permission: system:read
 */
router.get(
  '/info',
  rateLimiter.api(),
  authorize('system:read'),
  async (req: Request, res: Response) => {
    try {
      Logger.api('Fetching system info', req.requestId, {
        user_id: req.user?.id
      });

      const systemInfo = {
        application: {
          name: 'MCP Management API',
          version: '1.0.0',
          environment: config.environment,
          uptime: process.uptime(),
          startTime: new Date(Date.now() - process.uptime() * 1000)
        },
        runtime: {
          node: {
            version: process.version,
            platform: process.platform,
            arch: process.arch
          },
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        database: {
          connected: false,
          connectionCount: 0,
          type: 'PostgreSQL'
        },
        bridge: {
          connected: false,
          url: config.mcpBridge.baseUrl,
          version: null
        },
        security: {
          environment: config.environment,
          corsOrigins: config.security.cors.origin.length,
          rateLimiting: {
            enabled: true,
            windowMs: config.security.rateLimiting.windowMs,
            max: config.security.rateLimiting.max
          }
        }
      };

      // Get database info
      try {
        const dbHealth = await db.healthCheck();
        const dbInfo = await db.getConnectionInfo();
        systemInfo.database = {
          connected: dbHealth,
          connectionCount: dbInfo.totalConnections,
          type: 'PostgreSQL',
          database: dbInfo.database,
          idleConnections: dbInfo.idleConnections
        };
      } catch (error) {
        Logger.warn('Failed to get database info', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Get bridge info
      try {
        const mcpBridge = getMCPBridgeClient();
        const bridgeTest = await mcpBridge.testConnection();
        systemInfo.bridge = {
          connected: bridgeTest.connected,
          url: config.mcpBridge.baseUrl,
          version: bridgeTest.version,
          responseTime: bridgeTest.responseTime,
          error: bridgeTest.error
        };
      } catch (error) {
        Logger.warn('Failed to get bridge info', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      res.status(200).json({
        success: true,
        data: systemInfo,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });

    } catch (error) {
      Logger.error('Failed to get system info', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system information',
        requestId: req.requestId
      });
    }
  }
);

/**
 * GET /api/v1/system/config
 * Get system configuration (sanitized)
 * Permission: system:read
 */
router.get(
  '/config',
  rateLimiter.api(),
  authorize('system:read'),
  (req: Request, res: Response) => {
    try {
      Logger.api('Fetching system config', req.requestId, {
        user_id: req.user?.id
      });

      // Return sanitized configuration (no secrets)
      const sanitizedConfig = {
        application: {
          environment: config.environment,
          port: config.port
        },
        database: {
          host: config.database.host,
          port: config.database.port,
          database: config.database.database,
          maxConnections: config.database.maxConnections,
          ssl: config.database.ssl
        },
        security: {
          cors: {
            origins: config.security.cors.origin,
            credentials: config.security.cors.credentials,
            maxAge: config.security.cors.maxAge
          },
          rateLimiting: {
            windowMs: config.security.rateLimiting.windowMs,
            max: config.security.rateLimiting.max
          },
          jwtExpiresIn: config.security.jwtExpiresIn
        },
        logging: {
          level: config.logging.level,
          format: config.logging.format,
          destination: config.logging.destination
        },
        bridge: {
          baseUrl: config.mcpBridge.baseUrl,
          timeout: config.mcpBridge.timeout,
          retryAttempts: config.mcpBridge.retryAttempts,
          healthCheckInterval: config.mcpBridge.healthCheckInterval
        }
      };

      res.status(200).json({
        success: true,
        data: sanitizedConfig,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });

    } catch (error) {
      Logger.error('Failed to get system config', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system configuration',
        requestId: req.requestId
      });
    }
  }
);

/**
 * GET /api/v1/system/stats
 * Get system statistics
 * Permission: system:read
 */
router.get(
  '/stats',
  rateLimiter.api(),
  authorize('system:read'),
  async (req: Request, res: Response) => {
    try {
      Logger.api('Fetching system stats', req.requestId, {
        user_id: req.user?.id
      });

      const stats = {
        uptime: {
          seconds: process.uptime(),
          formatted: formatUptime(process.uptime())
        },
        memory: {
          ...process.memoryUsage(),
          formatted: {
            rss: formatBytes(process.memoryUsage().rss),
            heapTotal: formatBytes(process.memoryUsage().heapTotal),
            heapUsed: formatBytes(process.memoryUsage().heapUsed),
            external: formatBytes(process.memoryUsage().external)
          }
        },
        cpu: process.cpuUsage(),
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          pid: process.pid,
          title: process.title
        },
        environment: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: process.env.LANG || 'en_US.UTF-8',
          cwd: process.cwd()
        }
      };

      // Add OS-specific stats if available
      if (process.platform !== 'win32') {
        try {
          const os = require('os');
          stats.system = {
            ...stats.system,
            loadAverage: os.loadavg(),
            totalMemory: formatBytes(os.totalmem()),
            freeMemory: formatBytes(os.freemem()),
            cpuCount: os.cpus().length
          };
        } catch (error) {
          // OS stats not available
        }
      }

      res.status(200).json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });

    } catch (error) {
      Logger.error('Failed to get system stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system statistics',
        requestId: req.requestId
      });
    }
  }
);

/**
 * GET /api/v1/system/logs
 * Get recent system logs (if file logging is enabled)
 * Permission: system:read
 */
router.get(
  '/logs',
  rateLimiter.api(),
  authorize('system:read'),
  (req: Request, res: Response) => {
    try {
      Logger.api('Fetching system logs', req.requestId, {
        user_id: req.user?.id
      });

      // For security and simplicity, return a message about log access
      res.status(200).json({
        success: true,
        data: {
          message: 'Log access via API is not implemented for security reasons',
          logLocation: config.logging.destination === 'file' || config.logging.destination === 'both' 
            ? 'logs/' : 'console only',
          logLevel: config.logging.level,
          logFormat: config.logging.format,
          suggestion: 'Use direct file access or log aggregation system for log analysis'
        },
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });

    } catch (error) {
      Logger.error('Failed to get system logs', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system logs',
        requestId: req.requestId
      });
    }
  }
);

/**
 * POST /api/v1/system/maintenance
 * Trigger maintenance operations
 * Permission: system:write
 */
router.post(
  '/maintenance',
  rateLimiter.strict(),
  authorize('system:write'),
  async (req: Request, res: Response) => {
    try {
      const { operation } = req.body;
      
      Logger.api('Maintenance operation requested', req.requestId, {
        user_id: req.user?.id,
        operation
      });

      const allowedOperations = ['vacuum', 'cleanup', 'health-check'];
      
      if (!allowedOperations.includes(operation)) {
        res.status(400).json({
          success: false,
          error: 'Invalid maintenance operation',
          allowedOperations,
          requestId: req.requestId
        });
        return;
      }

      let result;
      
      switch (operation) {
        case 'vacuum':
          // Database vacuum operation
          await db.vacuum();
          result = { operation: 'vacuum', status: 'completed', message: 'Database vacuum completed' };
          break;
          
        case 'cleanup':
          // Cleanup old data
          await db.query('SELECT cleanup_old_data()');
          result = { operation: 'cleanup', status: 'completed', message: 'Data cleanup completed' };
          break;
          
        case 'health-check':
          // Comprehensive health check
          const dbHealth = await db.healthCheck();
          const mcpBridge = getMCPBridgeClient();
          const bridgeHealth = await mcpBridge.testConnection();
          
          result = {
            operation: 'health-check',
            status: 'completed',
            results: {
              database: { healthy: dbHealth },
              bridge: { 
                connected: bridgeHealth.connected,
                responseTime: bridgeHealth.responseTime
              }
            }
          };
          break;
          
        default:
          throw new Error('Operation not implemented');
      }

      Logger.audit('Maintenance operation completed', {
        user_id: req.user?.id,
        operation,
        result: result.status,
        request_id: req.requestId
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });

    } catch (error) {
      Logger.error('Maintenance operation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id,
        operation: req.body.operation
      });

      res.status(500).json({
        success: false,
        error: 'Maintenance operation failed',
        requestId: req.requestId
      });
    }
  }
);

// Helper functions
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function formatBytes(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

export default router;