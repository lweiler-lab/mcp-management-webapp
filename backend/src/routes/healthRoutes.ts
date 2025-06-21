import { Router, Request, Response } from 'express';
import { getMCPBridgeClient } from '@/services/mcpBridgeClient';
import { db } from '@/database/connection';
import Logger from '@/utils/logger';
import config from '@/config';

/**
 * Health Check Routes
 * Public endpoints for system health monitoring
 */
const router = Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Basic health response
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.environment,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      responseTime: 0
    };

    health.responseTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      data: health
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    Logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      response_time: responseTime
    });

    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
      responseTime
    });
  }
});

/**
 * GET /health/detailed
 * Comprehensive health check including all dependencies
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const checks: any[] = [];

  try {
    // Database health check
    const dbStart = Date.now();
    const dbHealthy = await db.healthCheck();
    checks.push({
      service: 'database',
      status: dbHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - dbStart,
      details: dbHealthy ? await db.getConnectionInfo() : null
    });

    // MCP Bridge health check
    const bridgeStart = Date.now();
    const mcpBridge = getMCPBridgeClient();
    const bridgeConnection = await mcpBridge.testConnection();
    checks.push({
      service: 'mcp_bridge',
      status: bridgeConnection.connected ? 'healthy' : 'unhealthy',
      responseTime: bridgeConnection.responseTime,
      details: {
        connected: bridgeConnection.connected,
        version: bridgeConnection.version,
        error: bridgeConnection.error
      }
    });

    // System health
    const systemStart = Date.now();
    const systemHealth = {
      nodejs: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : null,
      cpuUsage: process.cpuUsage()
    };
    checks.push({
      service: 'system',
      status: 'healthy',
      responseTime: Date.now() - systemStart,
      details: systemHealth
    });

    // Overall health determination
    const overallHealthy = checks.every(check => check.status === 'healthy');
    const totalResponseTime = Date.now() - startTime;

    const healthResponse = {
      status: overallHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.environment,
      responseTime: totalResponseTime,
      checks,
      summary: {
        total: checks.length,
        healthy: checks.filter(c => c.status === 'healthy').length,
        unhealthy: checks.filter(c => c.status === 'unhealthy').length,
        degraded: checks.filter(c => c.status === 'degraded').length
      }
    };

    Logger.health('system', overallHealthy ? 'healthy' : 'degraded', {
      response_time: totalResponseTime,
      checks_total: checks.length,
      checks_healthy: healthResponse.summary.healthy
    });

    res.status(overallHealthy ? 200 : 503).json({
      success: true,
      data: healthResponse
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    Logger.error('Detailed health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      response_time: responseTime,
      completed_checks: checks.length
    });

    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
      responseTime,
      checks
    });
  }
});

/**
 * GET /health/readiness
 * Kubernetes-style readiness probe
 */
router.get('/readiness', async (req: Request, res: Response) => {
  try {
    // Check if service is ready to serve traffic
    const dbHealthy = await db.healthCheck();
    
    if (!dbHealthy) {
      res.status(503).json({
        success: false,
        status: 'not_ready',
        message: 'Database not ready'
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: 'ready',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.error('Readiness check failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(503).json({
      success: false,
      status: 'not_ready',
      error: 'Readiness check failed'
    });
  }
});

/**
 * GET /health/liveness
 * Kubernetes-style liveness probe
 */
router.get('/liveness', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /health/metrics
 * Prometheus-style metrics endpoint
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = {
      // Node.js metrics
      nodejs_version: process.version,
      nodejs_uptime_seconds: process.uptime(),
      nodejs_memory_usage_bytes: process.memoryUsage(),
      nodejs_cpu_usage: process.cpuUsage(),
      
      // System metrics
      system_platform: process.platform,
      system_arch: process.arch,
      system_load_average: process.platform !== 'win32' ? require('os').loadavg() : null,
      
      // Application metrics (would be enhanced with actual metrics)
      http_requests_total: 0, // Would track actual requests
      http_request_duration_seconds: 0,
      websocket_connections_active: 0,
      database_connections_active: 0,
      
      // Custom metrics
      mcp_servers_managed: 0,
      mcp_bridge_connected: false,
      
      timestamp: new Date().toISOString()
    };

    // Try to get actual metrics from database and bridge
    try {
      const dbInfo = await db.getConnectionInfo();
      metrics.database_connections_active = dbInfo.totalConnections;
      
      const mcpBridge = getMCPBridgeClient();
      const bridgeTest = await mcpBridge.testConnection();
      metrics.mcp_bridge_connected = bridgeTest.connected;
      
    } catch (error) {
      Logger.warn('Failed to get detailed metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Return metrics in JSON format (could be Prometheus format if needed)
    res.status(200).json({
      success: true,
      data: metrics
    });

  } catch (error) {
    Logger.error('Metrics endpoint failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics'
    });
  }
});

export default router;