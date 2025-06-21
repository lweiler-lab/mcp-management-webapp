import { Router, Request, Response } from 'express';
import { authenticate, authorize, rateLimiter } from '@/middleware/security';
import { getMCPBridgeClient } from '@/services/mcpBridgeClient';
import Logger from '@/utils/logger';
import { z } from 'zod';

/**
 * Metrics Routes
 * Handles performance metrics and monitoring data
 */
const router = Router();

// Apply authentication to all metrics routes
router.use(authenticate);

// Validation schemas
const MetricsQuerySchema = z.object({
  serverId: z.string().uuid().optional(),
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('5m'),
  metrics: z.string().optional().transform(val => val ? val.split(',') : undefined)
});

const TimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime()
});

/**
 * GET /api/v1/metrics
 * Get aggregated system metrics
 */
router.get(
  '/',
  rateLimiter.api(),
  authorize('metrics:read'),
  async (req: Request, res: Response) => {
    try {
      const query = MetricsQuerySchema.parse(req.query);
      
      Logger.api('Fetching system metrics', req.requestId, {
        user_id: req.user?.id,
        query
      });

      // Get metrics from MCP Bridge
      const mcpBridge = getMCPBridgeClient();
      
      // Calculate time range
      const timeRange = calculateTimeRange(query.timeRange);
      
      try {
        // Get bridge metrics
        const bridgeMetrics = await mcpBridge.getMetrics(timeRange);
        const bridgeData = await mcpBridge.aggregateBridgeData();
        
        // Aggregate metrics
        const metrics = {
          timeRange: {
            start: timeRange.start,
            end: timeRange.end,
            interval: query.interval
          },
          bridge: {
            connected: bridgeData.health,
            uptime: bridgeData.uptime,
            activeConnections: bridgeData.activeConnections,
            memoryOperations: bridgeData.memoryOperations,
            semanticSearches: bridgeData.semanticSearches,
            metrics: bridgeMetrics
          },
          system: {
            nodejs: {
              version: process.version,
              uptime: process.uptime(),
              memory: process.memoryUsage(),
              cpu: process.cpuUsage()
            },
            timestamp: new Date()
          },
          // Would include database metrics, API metrics, etc.
          aggregated: {
            totalRequests: 0, // Would come from actual metrics
            averageResponseTime: 0,
            errorRate: 0,
            throughput: 0
          }
        };

        res.status(200).json({
          success: true,
          data: metrics,
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });

      } catch (bridgeError) {
        Logger.warn('Failed to get bridge metrics', {
          error: bridgeError instanceof Error ? bridgeError.message : 'Unknown error',
          request_id: req.requestId
        });

        // Return system metrics only
        res.status(200).json({
          success: true,
          data: {
            timeRange: {
              start: timeRange.start,
              end: timeRange.end,
              interval: query.interval
            },
            bridge: {
              connected: false,
              error: 'Bridge unreachable'
            },
            system: {
              nodejs: {
                version: process.version,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
              },
              timestamp: new Date()
            },
            warning: 'Bridge metrics unavailable'
          },
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
          requestId: req.requestId
        });
        return;
      }

      Logger.error('Failed to get metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve metrics',
        requestId: req.requestId
      });
    }
  }
);

/**
 * GET /api/v1/metrics/servers/:id
 * Get metrics for specific server
 */
router.get(
  '/servers/:id',
  rateLimiter.api(),
  authorize('metrics:read'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const query = MetricsQuerySchema.parse(req.query);
      
      Logger.api('Fetching server metrics', req.requestId, {
        user_id: req.user?.id,
        server_id: id,
        query
      });

      // For now, return mock server-specific metrics
      // In a real implementation, this would fetch from metrics database
      const timeRange = calculateTimeRange(query.timeRange);
      
      const serverMetrics = {
        serverId: id,
        timeRange: {
          start: timeRange.start,
          end: timeRange.end,
          interval: query.interval
        },
        metrics: {
          // Mock time series data
          responseTime: generateMockTimeSeries(timeRange, query.interval, 50, 200),
          requestCount: generateMockTimeSeries(timeRange, query.interval, 100, 1000),
          errorRate: generateMockTimeSeries(timeRange, query.interval, 0, 0.05),
          cpuUsage: generateMockTimeSeries(timeRange, query.interval, 20, 80),
          memoryUsage: generateMockTimeSeries(timeRange, query.interval, 30, 70)
        },
        summary: {
          averageResponseTime: 125,
          totalRequests: 45000,
          errorRate: 0.02,
          uptime: 0.999,
          healthScore: 0.95
        },
        alerts: {
          active: 0,
          total: 3
        }
      };

      res.status(200).json({
        success: true,
        data: serverMetrics,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
          requestId: req.requestId
        });
        return;
      }

      Logger.error('Failed to get server metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        server_id: req.params.id,
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve server metrics',
        requestId: req.requestId
      });
    }
  }
);

/**
 * GET /api/v1/metrics/bridge
 * Get real-time MCP Bridge metrics
 */
router.get(
  '/bridge',
  rateLimiter.api(),
  authorize('metrics:read'),
  async (req: Request, res: Response) => {
    try {
      Logger.api('Fetching bridge metrics', req.requestId, {
        user_id: req.user?.id
      });

      const mcpBridge = getMCPBridgeClient();
      
      try {
        const bridgeData = await mcpBridge.aggregateBridgeData();
        const connectionTest = await mcpBridge.testConnection();
        
        const bridgeMetrics = {
          connection: {
            connected: bridgeData.health,
            responseTime: connectionTest.responseTime,
            version: connectionTest.version,
            lastChecked: new Date()
          },
          operations: {
            activeConnections: bridgeData.activeConnections,
            memoryOperations: bridgeData.memoryOperations,
            semanticSearches: bridgeData.semanticSearches,
            uptime: bridgeData.uptime
          },
          performance: {
            status: bridgeData.status,
            metrics: bridgeData.metrics
          },
          health: {
            overall: bridgeData.health ? 'healthy' : 'unhealthy',
            score: bridgeData.health ? 1.0 : 0.0,
            issues: bridgeData.health ? [] : ['Bridge unreachable']
          }
        };

        res.status(200).json({
          success: true,
          data: bridgeMetrics,
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });

      } catch (bridgeError) {
        Logger.warn('Bridge metrics unavailable', {
          error: bridgeError instanceof Error ? bridgeError.message : 'Unknown error',
          request_id: req.requestId
        });

        res.status(503).json({
          success: false,
          error: 'MCP Bridge unreachable',
          data: {
            connection: {
              connected: false,
              lastChecked: new Date()
            },
            health: {
              overall: 'unhealthy',
              score: 0.0,
              issues: ['Bridge unreachable']
            }
          },
          requestId: req.requestId
        });
      }

    } catch (error) {
      Logger.error('Failed to get bridge metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bridge metrics',
        requestId: req.requestId
      });
    }
  }
);

/**
 * GET /api/v1/metrics/summary
 * Get high-level metrics summary
 */
router.get(
  '/summary',
  rateLimiter.api(),
  authorize('metrics:read'),
  async (req: Request, res: Response) => {
    try {
      Logger.api('Fetching metrics summary', req.requestId, {
        user_id: req.user?.id
      });

      // Aggregate summary from various sources
      const summary = {
        system: {
          status: 'healthy',
          uptime: process.uptime(),
          version: '1.0.0'
        },
        bridge: {
          connected: false,
          operations: 0,
          uptime: 0
        },
        servers: {
          total: 0,
          healthy: 0,
          warning: 0,
          critical: 0
        },
        performance: {
          averageResponseTime: 0,
          requestsPerSecond: 0,
          errorRate: 0
        },
        alerts: {
          active: 0,
          critical: 0,
          warnings: 0
        }
      };

      // Try to get real bridge data
      try {
        const mcpBridge = getMCPBridgeClient();
        const bridgeData = await mcpBridge.aggregateBridgeData();
        
        summary.bridge = {
          connected: bridgeData.health,
          operations: bridgeData.memoryOperations + bridgeData.semanticSearches,
          uptime: bridgeData.uptime
        };
      } catch (error) {
        // Bridge data will remain as defaults
      }

      res.status(200).json({
        success: true,
        data: summary,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });

    } catch (error) {
      Logger.error('Failed to get metrics summary', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.requestId,
        user_id: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve metrics summary',
        requestId: req.requestId
      });
    }
  }
);

// Helper functions
function calculateTimeRange(range: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case '1h':
      start.setHours(start.getHours() - 1);
      break;
    case '6h':
      start.setHours(start.getHours() - 6);
      break;
    case '24h':
      start.setDate(start.getDate() - 1);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    default:
      start.setDate(start.getDate() - 1);
  }

  return { start, end };
}

function generateMockTimeSeries(
  timeRange: { start: Date; end: Date },
  interval: string,
  min: number,
  max: number
): Array<{ timestamp: string; value: number }> {
  const points: Array<{ timestamp: string; value: number }> = [];
  const intervalMs = getIntervalMs(interval);
  
  for (let time = timeRange.start.getTime(); time <= timeRange.end.getTime(); time += intervalMs) {
    points.push({
      timestamp: new Date(time).toISOString(),
      value: Math.random() * (max - min) + min
    });
  }
  
  return points;
}

function getIntervalMs(interval: string): number {
  switch (interval) {
    case '1m': return 60 * 1000;
    case '5m': return 5 * 60 * 1000;
    case '15m': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    default: return 5 * 60 * 1000;
  }
}

export default router;